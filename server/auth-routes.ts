import { NextResponse, type NextRequest } from 'next/server';
import { proxyToAuth, type AuthProxyConfig } from './auth-proxy';
import {
  startImpersonation,
  stopImpersonation,
  type ImpersonationConfig,
} from './impersonation';
import { clearLanguageCookie, createProfileProxyHandlers } from './language';
import { effectiveCookieDomain } from './cookie-domain';
import { forwardExpiredPasswordChange } from './expired-password';

/**
 * Factory for the set of `/api/auth/*` route handlers that are functionally
 * identical across every user-facing app — the thin proxy/cookie endpoints.
 * Each app instantiates this once with its own cookie names and auth URL, then
 * re-exports the handlers from the matching `route.ts` files. Sibling of
 * `createIncidentsRoutes` / `createNotificationsRoutes`.
 *
 *   // src/lib/auth-server.ts
 *   import { createAuthRoutes } from '@mycolegal-app/ui/server/auth-routes';
 *   import { AUTH_INTERNAL_URL, JWT_COOKIE_NAME, REFRESH_COOKIE_NAME,
 *     SECURE_COOKIES, COOKIE_DOMAIN, COOKIE_MAX_AGE, REFRESH_COOKIE_MAX_AGE } from './config';
 *   export const authRoutes = createAuthRoutes({
 *     authInternalUrl: AUTH_INTERNAL_URL,
 *     jwtCookieName: JWT_COOKIE_NAME,
 *     refreshCookieName: REFRESH_COOKIE_NAME,
 *     secureCookies: SECURE_COOKIES,
 *     cookieDomain: COOKIE_DOMAIN,
 *     accessCookieMaxAge: COOKIE_MAX_AGE,
 *     refreshCookieMaxAge: REFRESH_COOKIE_MAX_AGE,
 *   });
 *
 *   // src/app/api/auth/logout/route.ts
 *   import { authRoutes } from '@/lib/auth-server';
 *   export const { POST } = authRoutes.logout;
 *
 * NOT covered (genuinely app-specific, stay in-app):
 *   - `login` / `login/select-org` — org-selection flow diverges per app.
 *   - `me` — assembles the app's own permission context (ROLE_PERMISSIONS).
 */
export interface AuthRoutesConfig {
  /** Base URL of the auth service in the internal network. */
  authInternalUrl: string;
  /** Cookie name carrying the JWT (e.g. `mycolegal-token`). */
  jwtCookieName: string;
  /** Cookie name carrying the refresh token. */
  refreshCookieName: string;
  /** Whether to set the Secure flag (true on https deployments). */
  secureCookies: boolean;
  /** Shared cookie domain for cross-app SSO (`.mycolegal.app`); undefined locally. */
  cookieDomain?: string;
  /** Access-token cookie max age (seconds). */
  accessCookieMaxAge: number;
  /** Refresh-token cookie max age (seconds). */
  refreshCookieMaxAge: number;
}

export function createAuthRoutes(config: AuthRoutesConfig) {
  const proxyConfig: AuthProxyConfig = {
    jwtCookieName: config.jwtCookieName,
    authInternalUrl: config.authInternalUrl,
  };

  const impersonationConfig: ImpersonationConfig = {
    authInternalUrl: config.authInternalUrl,
    sessionJwtCookieName: config.jwtCookieName,
    sessionRefreshCookieName: config.refreshCookieName,
    secureCookies: config.secureCookies,
    cookieDomain: config.cookieDomain,
    accessCookieMaxAge: config.accessCookieMaxAge,
    refreshCookieMaxAge: config.refreshCookieMaxAge,
  };

  const langCookieOpts = { secure: config.secureCookies, domain: config.cookieDomain };

  // The cookie `Domain` has to be resolved per-request: the configured shared
  // domain (`.mycolegal.app`) only lands when the request host is a suffix of
  // it. On hosts outside it (the `*.run.app` URL the e2e hits) the browser
  // would drop the cookie, so we fall back to a host-only cookie. See
  // effectiveCookieDomain. Clearing must use the SAME resolution that set the
  // cookie, otherwise the Set-Cookie won't match and the cookie survives.
  const domainFor = (request: NextRequest) =>
    effectiveCookieDomain(request.headers.get('host'), config.cookieDomain);

  const langCookieOptsFor = (request: NextRequest) => ({
    secure: config.secureCookies,
    domain: domainFor(request),
  });

  // Clear-cookie options shared by logout + session/timeout.
  const clearOptsFor = (request: NextRequest) => {
    const domain = domainFor(request);
    return {
      httpOnly: true,
      secure: config.secureCookies,
      sameSite: 'lax' as const,
      path: '/',
      maxAge: 0,
      ...(domain && { domain }),
    };
  };

  return {
    /** POST /api/auth/change-password — proxied straight to auth. */
    changePassword: {
      POST: (request: NextRequest) =>
        proxyToAuth(proxyConfig, request, '/auth/change-password'),
    },

    /**
     * POST /api/auth/password/expired — unauthenticated: rotate an expired
     * password by proving the current one. No session cookie is involved; the
     * client re-runs the normal login afterwards (see forwardExpiredPasswordChange).
     */
    expiredPassword: {
      POST: (request: NextRequest) =>
        forwardExpiredPasswordChange(config.authInternalUrl, request),
    },

    /** POST /api/auth/impersonate — org_admin starts impersonating a user of their org. */
    impersonate: {
      POST: (request: NextRequest) => startImpersonation(impersonationConfig, request),
    },

    /** POST /api/auth/impersonate/stop — end the impersonation session. */
    impersonateStop: {
      POST: (request: NextRequest) => stopImpersonation(impersonationConfig, request),
    },

    /** GET/PATCH /api/auth/me/profile — read/update profile (+ language cookie). */
    profile: createProfileProxyHandlers({
      authInternalUrl: config.authInternalUrl,
      jwtCookieName: config.jwtCookieName,
      cookieOpts: langCookieOpts,
    }),

    /**
     * POST /api/auth/refresh — forwards the refresh token to the auth service
     * and rotates both the access and refresh tokens on this app's domain.
     */
    refresh: {
      async POST(request: NextRequest): Promise<NextResponse> {
        const refreshToken = request.cookies.get(config.refreshCookieName)?.value;
        if (!refreshToken) {
          return NextResponse.json(
            { error: { code: 'UNAUTHORIZED', message: 'No refresh token' } },
            { status: 401 },
          );
        }

        const authResponse = await fetch(`${config.authInternalUrl}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });

        if (!authResponse.ok) {
          const errorText = await authResponse.text();
          return NextResponse.json(
            { error: { code: 'REFRESH_FAILED', message: `Token refresh failed: ${errorText}` } },
            { status: authResponse.status },
          );
        }

        const authData = (await authResponse.json()) as {
          accessToken: string;
          refreshToken?: string;
        };

        const response = NextResponse.json({ data: { accessToken: authData.accessToken } });
        const domain = domainFor(request);

        response.cookies.set(config.jwtCookieName, authData.accessToken, {
          httpOnly: true,
          secure: config.secureCookies,
          sameSite: 'lax',
          path: '/',
          maxAge: config.accessCookieMaxAge,
          ...(domain && { domain }),
        });

        if (authData.refreshToken) {
          response.cookies.set(config.refreshCookieName, authData.refreshToken, {
            httpOnly: true,
            secure: config.secureCookies,
            sameSite: 'lax',
            path: '/',
            maxAge: config.refreshCookieMaxAge,
            ...(domain && { domain }),
          });
        }

        return response;
      },
    },

    /**
     * POST /api/auth/session/timeout — best-effort SESSION_TIMEOUT audit then
     * clear cookies. IdleTimeout fires this instead of logout so auth can
     * distinguish the two in the audit trail. Swallows upstream failures: the
     * cookie MUST be cleared even if auth is momentarily unreachable.
     */
    sessionTimeout: {
      async POST(request: NextRequest): Promise<NextResponse> {
        const token = request.cookies.get(config.jwtCookieName)?.value;
        const refreshToken = request.cookies.get(config.refreshCookieName)?.value;
        if (token) {
          try {
            await fetch(`${config.authInternalUrl}/auth/session/timeout`, {
              method: 'POST',
              // Empty body with Content-Type: application/json would trip Fastify's
              // JSON body parser into FST_ERR_CTP_EMPTY_JSON_BODY (400), so we send
              // a placeholder '{}' and auth's handler simply ignores it.
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
                ...(refreshToken && { Cookie: `refreshToken=${refreshToken}` }),
              },
              body: '{}',
            });
          } catch {}
        }
        const response = NextResponse.json({ success: true });
        const clearOpts = clearOptsFor(request);
        response.cookies.set(config.jwtCookieName, '', clearOpts);
        response.cookies.set(config.refreshCookieName, '', clearOpts);
        return response;
      },
    },

    /**
     * POST /api/auth/logout — best-effort auth logout, then clear the session
     * cookies and the language cookie on this app's domain.
     */
    logout: {
      async POST(request: NextRequest): Promise<NextResponse> {
        const token = request.cookies.get(config.jwtCookieName)?.value;
        const refreshToken = request.cookies.get(config.refreshCookieName)?.value;

        if (token) {
          try {
            await fetch(`${config.authInternalUrl}/auth/logout`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
                ...(refreshToken && { Cookie: `refreshToken=${refreshToken}` }),
              },
              body: '{}',
            });
          } catch {
            // Non-fatal
          }
        }

        const response = NextResponse.json({ success: true });
        const clearOpts = clearOptsFor(request);
        response.cookies.set(config.jwtCookieName, '', clearOpts);
        response.cookies.set(config.refreshCookieName, '', clearOpts);
        clearLanguageCookie(response, langCookieOptsFor(request));
        return response;
      },
    },
  };
}
