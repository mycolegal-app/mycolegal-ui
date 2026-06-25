import { NextResponse, type NextRequest } from 'next/server';
import { effectiveCookieDomain } from './cookie-domain';

/**
 * Server-side impersonation flow shared by all consumer apps (admin for
 * superadmin, notaria/legifirma for org_admin).
 *
 * Two cookie roles, because the admin console uses its own session cookie
 * (`admin_token`) while the user-facing apps share `mycolegal-token`:
 *  - SESSION cookies: where the impersonation session is written. These MUST be
 *    the cookies the target user-facing apps read (`mycolegal-token` /
 *    `mycolegal-refresh`), so the impersonated session is picked up after the
 *    redirect.
 *  - ACTOR cookies: the actor's own current session — used to read the bearer
 *    for /auth/impersonate and preserved (as `<name>__actor`) for restore on
 *    stop. Defaults to the session cookies (the same-app org_admin flow, where
 *    actor and session are the same cookie).
 *
 * In production every user-facing app shares the session cookie names and
 * COOKIE_DOMAIN=.mycolegal.app, so the impersonation session is visible across
 * apps: start from one, exit from another.
 *
 * Auth-service contract (see mycolegal-auth):
 *  - POST /auth/impersonate      { targetUserId } + Bearer actor  → { accessToken, refreshToken, user, impersonatedBy }
 *  - POST /auth/impersonate/stop { refreshToken } + Bearer imp    → { success }
 */
export interface ImpersonationConfig {
  /** Base URL of the auth service in the internal network. */
  authInternalUrl: string;
  /** Cookie the impersonation access token is written to (the user-app cookie). */
  sessionJwtCookieName: string;
  /** Cookie the impersonation refresh token is written to (the user-app cookie). */
  sessionRefreshCookieName: string;
  /** Actor's access-token cookie. Defaults to the session cookie. */
  actorJwtCookieName?: string;
  /** Actor's refresh-token cookie. Defaults to the session refresh cookie. */
  actorRefreshCookieName?: string;
  /** Whether to set the Secure flag (true on https deployments). */
  secureCookies: boolean;
  /** Shared cookie domain for cross-app SSO (`.mycolegal.app`); undefined locally. */
  cookieDomain?: string;
  /** SameSite policy; apps use 'lax'. */
  sameSite?: 'lax' | 'strict';
  /** Access-token cookie max age (seconds). */
  accessCookieMaxAge: number;
  /** Refresh-token cookie max age (seconds). */
  refreshCookieMaxAge: number;
  /**
   * Where the actor should return after exiting impersonation. Set by the admin
   * console (its own URL) because the superadmin's session lives in a different
   * cookie that the user-facing apps can't read — so exiting from a user app
   * would otherwise dump them on that app's login. Stored in a readable
   * (non-httpOnly) `mc-imp-return` cookie the banner uses as its exit target.
   * Omit for the org_admin flow, where exiting just reloads the current app.
   */
  returnUrlAfterStop?: string;
}

/** Readable cookie that tells the banner where to send the actor on exit. */
const RETURN_COOKIE = 'mc-imp-return';

interface ResolvedNames {
  sessionJwt: string;
  sessionRefresh: string;
  actorJwt: string;
  actorRefresh: string;
  /** Cookies holding the preserved actor session during impersonation. */
  savedActorJwt: string;
  savedActorRefresh: string;
}

function resolveNames(config: ImpersonationConfig): ResolvedNames {
  const actorJwt = config.actorJwtCookieName ?? config.sessionJwtCookieName;
  const actorRefresh = config.actorRefreshCookieName ?? config.sessionRefreshCookieName;
  return {
    sessionJwt: config.sessionJwtCookieName,
    sessionRefresh: config.sessionRefreshCookieName,
    actorJwt,
    actorRefresh,
    savedActorJwt: `${actorJwt}__actor`,
    savedActorRefresh: `${actorRefresh}__actor`,
  };
}

// The cookie `Domain` is resolved per-request (see effectiveCookieDomain): the
// shared `.mycolegal.app` domain only lands when the request host is a suffix
// of it, else we fall back to a host-only cookie (`domain` undefined). Both
// set and clear must use the same resolution so the clear matches the set.
function cookieOptions(config: ImpersonationConfig, maxAge: number, domain: string | undefined) {
  return {
    httpOnly: true,
    secure: config.secureCookies,
    sameSite: config.sameSite ?? ('lax' as const),
    path: '/',
    domain,
    maxAge,
  };
}

function clearCookie(name: string, domain: string | undefined) {
  return { name, path: '/', domain };
}

/**
 * Start impersonating a target user. Reads the actor's bearer token, calls the
 * auth service, preserves the actor session, and writes the impersonation
 * session to the (user-app) session cookies. Authorization is enforced by the
 * auth service, not here.
 */
export async function startImpersonation(
  config: ImpersonationConfig,
  request: NextRequest,
): Promise<NextResponse> {
  const names = resolveNames(config);
  const domain = effectiveCookieDomain(request.headers.get('host'), config.cookieDomain);
  const actorToken = request.cookies.get(names.actorJwt)?.value;
  const actorRefresh = request.cookies.get(names.actorRefresh)?.value;

  if (!actorToken) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'No hay sesión activa' } },
      { status: 401 },
    );
  }

  let body: { targetUserId?: string };
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  if (!body.targetUserId) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'targetUserId es obligatorio' } },
      { status: 422 },
    );
  }

  const authResponse = await fetch(`${config.authInternalUrl}/auth/impersonate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${actorToken}` },
    body: JSON.stringify({ targetUserId: body.targetUserId }),
  });

  const data = await authResponse.json().catch(() => ({}));

  if (!authResponse.ok) {
    return NextResponse.json(
      {
        error: {
          code: data?.error?.code || data?.code || 'IMPERSONATE_FAILED',
          message: data?.message || data?.error?.message || 'No se pudo iniciar la impersonación',
        },
      },
      { status: authResponse.status },
    );
  }

  const { accessToken, refreshToken, user } = data as {
    accessToken?: string;
    refreshToken?: string;
    user?: unknown;
  };

  if (!accessToken) {
    return NextResponse.json(
      { error: { code: 'IMPERSONATE_ERROR', message: 'No se recibió token de impersonación' } },
      { status: 502 },
    );
  }

  const response = NextResponse.json({ data: { user } });

  // Preserve the actor session for restore-on-stop. Retained for the
  // refresh-token lifetime so a long impersonation can still be exited.
  response.cookies.set(names.savedActorJwt, actorToken, cookieOptions(config, config.refreshCookieMaxAge, domain));
  if (actorRefresh) {
    response.cookies.set(names.savedActorRefresh, actorRefresh, cookieOptions(config, config.refreshCookieMaxAge, domain));
  }

  // Write the impersonation session to the user-app session cookies.
  response.cookies.set(names.sessionJwt, accessToken, cookieOptions(config, config.accessCookieMaxAge, domain));
  if (refreshToken) {
    response.cookies.set(names.sessionRefresh, refreshToken, cookieOptions(config, config.refreshCookieMaxAge, domain));
  }

  // Remember where to send the actor on exit (admin flow). Readable by the
  // banner; carries only a URL, no secret.
  if (config.returnUrlAfterStop) {
    response.cookies.set(RETURN_COOKIE, config.returnUrlAfterStop, {
      httpOnly: false,
      secure: config.secureCookies,
      sameSite: config.sameSite ?? ('lax' as const),
      path: '/',
      domain,
      maxAge: config.refreshCookieMaxAge,
    });
  }

  return response;
}

/**
 * Stop impersonating: revokes the impersonation session on the auth side
 * (best-effort) and restores the actor's preserved session. When the actor and
 * session cookies differ (admin console), the impersonation session cookies are
 * cleared separately so the actor's own session (a different cookie) is left
 * intact.
 */
export async function stopImpersonation(
  config: ImpersonationConfig,
  request: NextRequest,
): Promise<NextResponse> {
  const names = resolveNames(config);
  const domain = effectiveCookieDomain(request.headers.get('host'), config.cookieDomain);

  const impToken = request.cookies.get(names.sessionJwt)?.value;
  const impRefresh = request.cookies.get(names.sessionRefresh)?.value;
  const savedActorToken = request.cookies.get(names.savedActorJwt)?.value;
  const savedActorRefresh = request.cookies.get(names.savedActorRefresh)?.value;

  // Best-effort revoke of the impersonation refresh token.
  try {
    await fetch(`${config.authInternalUrl}/auth/impersonate/stop`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(impToken ? { Authorization: `Bearer ${impToken}` } : {}),
      },
      body: JSON.stringify({ refreshToken: impRefresh }),
    });
  } catch {
    // ignore network errors — local restore still proceeds
  }

  const response = NextResponse.json({ data: { restored: Boolean(savedActorToken) } });
  const sameCookie = names.sessionJwt === names.actorJwt;

  if (sameCookie) {
    // org_admin flow: impersonation occupies the actor's own cookie. Restore
    // overwrites it; clear only if there was nothing to restore.
    if (savedActorToken) {
      response.cookies.set(names.actorJwt, savedActorToken, cookieOptions(config, config.accessCookieMaxAge, domain));
      if (savedActorRefresh) {
        response.cookies.set(names.actorRefresh, savedActorRefresh, cookieOptions(config, config.refreshCookieMaxAge, domain));
      } else {
        response.cookies.delete(clearCookie(names.actorRefresh, domain));
      }
    } else {
      response.cookies.delete(clearCookie(names.sessionJwt, domain));
      response.cookies.delete(clearCookie(names.sessionRefresh, domain));
    }
  } else {
    // admin flow: clear the impersonation (session) cookies; the actor's own
    // session lives in a different cookie and is left untouched (restored
    // defensively if a preserved copy exists).
    response.cookies.delete(clearCookie(names.sessionJwt, domain));
    response.cookies.delete(clearCookie(names.sessionRefresh, domain));
    if (savedActorToken) {
      response.cookies.set(names.actorJwt, savedActorToken, cookieOptions(config, config.accessCookieMaxAge, domain));
      if (savedActorRefresh) {
        response.cookies.set(names.actorRefresh, savedActorRefresh, cookieOptions(config, config.refreshCookieMaxAge, domain));
      }
    }
  }

  // Drop the preserved-actor cookies and the return hint.
  response.cookies.delete(clearCookie(names.savedActorJwt, domain));
  response.cookies.delete(clearCookie(names.savedActorRefresh, domain));
  response.cookies.delete(clearCookie(RETURN_COOKIE, domain));

  return response;
}
