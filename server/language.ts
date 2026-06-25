import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { decodeJwt } from 'jose';
import { effectiveCookieDomain } from './cookie-domain';

// --------------------------------------------------------------------------
// Constants and types
// --------------------------------------------------------------------------

/** Cookie name used by all consumer apps to remember the user's UI language. */
export const LANG_COOKIE_NAME = 'mc_lang';

/** 1 año. La cookie es no-httpOnly para permitir lectura cliente si hace falta. */
export const LANG_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export const VALID_LANGS = ['CAST', 'CAT', 'VAL', 'GAL', 'EUS'] as const;
export type Language = (typeof VALID_LANGS)[number];

const VALID_LANGS_SET = new Set<string>(VALID_LANGS);

export function isValidLanguage(value: unknown): value is Language {
  return typeof value === 'string' && VALID_LANGS_SET.has(value);
}

/** Type-safe pick: returns the value if it's a valid Language, else null. */
export function pickLanguage(value: unknown): Language | null {
  return isValidLanguage(value) ? value : null;
}

// --------------------------------------------------------------------------
// JWT decode
// --------------------------------------------------------------------------

/**
 * Extract `language` from a JWT payload without verifying the signature.
 * The verification was already performed by auth when minting the token; the
 * dashboard layout only needs to read the claim, not re-validate it.
 */
export function languageFromJwt(token: string): Language | null {
  try {
    return pickLanguage(decodeJwt(token).language);
  } catch {
    return null;
  }
}

// --------------------------------------------------------------------------
// Cookie ops on a NextResponse
// --------------------------------------------------------------------------

export interface LanguageCookieOpts {
  /** Whether to mark the cookie as `Secure` — usually `APP_URL.startsWith('https')`. */
  secure: boolean;
  /** Optional cookie domain for cross-subdomain SSO (e.g. `.mycolegal.app`). */
  domain?: string;
}

/**
 * Set the `mc_lang` cookie on a NextResponse. Idempotent — calling again
 * with a different value overwrites. No httpOnly so client code can read it.
 */
export function setLanguageCookie(
  response: NextResponse,
  language: Language,
  opts: LanguageCookieOpts,
): void {
  response.cookies.set(LANG_COOKIE_NAME, language, {
    path: '/',
    maxAge: LANG_COOKIE_MAX_AGE,
    sameSite: 'lax',
    secure: opts.secure,
    ...(opts.domain && { domain: opts.domain }),
  });
}

/**
 * Clear the `mc_lang` cookie. Use this in the logout handler so the next
 * user logging into this browser starts with their own language instead of
 * inheriting the previous user's preference.
 */
export function clearLanguageCookie(
  response: NextResponse,
  opts: LanguageCookieOpts,
): void {
  response.cookies.set(LANG_COOKIE_NAME, '', {
    path: '/',
    maxAge: 0,
    sameSite: 'lax',
    secure: opts.secure,
    ...(opts.domain && { domain: opts.domain }),
  });
}

// --------------------------------------------------------------------------
// Layout helper: cascade cookie → JWT → fallback
// --------------------------------------------------------------------------

/**
 * Resolve the UI language for a server-component layout. Cascade:
 *
 *   1. `mc_lang` cookie (set by login route, refreshed by PATCH proxy when
 *      the user changes language). Most recent — wins if present.
 *   2. `language` claim of the JWT (decode without verify). Covers first
 *      render after login when the cookie isn't seeded yet.
 *   3. Provided fallback (default `CAST`).
 */
export async function resolveDashboardLanguage(opts: {
  jwtCookieName: string;
  fallback?: Language;
}): Promise<Language> {
  const fallback = opts.fallback ?? 'CAST';
  const cookieStore = await cookies();
  const fromCookie = pickLanguage(cookieStore.get(LANG_COOKIE_NAME)?.value);
  if (fromCookie) return fromCookie;
  const token = cookieStore.get(opts.jwtCookieName)?.value;
  if (token) {
    const fromJwt = languageFromJwt(token);
    if (fromJwt) return fromJwt;
  }
  return fallback;
}

// --------------------------------------------------------------------------
// PATCH /api/auth/me/profile factory
// --------------------------------------------------------------------------

export interface ProfileProxyConfig {
  /** Base URL of the (private) auth service. */
  authInternalUrl: string;
  /** Cookie name carrying the JWT (e.g. `mycolegal-token`). */
  jwtCookieName: string;
  /** Cookie options for the language cookie. */
  cookieOpts: LanguageCookieOpts;
}

type RouteHandler = (request: NextRequest) => Promise<NextResponse>;

/**
 * Build the GET + PATCH handlers for `/api/auth/me/profile`.
 *
 * GET is a simple proxy. PATCH proxies the request to auth and, if auth
 * returns 2xx with a valid `data.language`, seeds the `mc_lang` cookie on
 * the response. Auth is private (no public URL) and therefore can't set
 * cookies in the user's browser — that has to happen on the app's domain.
 *
 * Use:
 * ```ts
 * export const { GET, PATCH } = createProfileProxyHandlers({
 *   authInternalUrl: AUTH_INTERNAL_URL,
 *   jwtCookieName: JWT_COOKIE_NAME,
 *   cookieOpts: { secure: SECURE_COOKIES, domain: COOKIE_DOMAIN },
 * });
 * ```
 */
export function createProfileProxyHandlers(config: ProfileProxyConfig): {
  GET: RouteHandler;
  PATCH: RouteHandler;
} {
  const url = `${config.authInternalUrl}/auth/me/profile`;

  const unauthorized = () =>
    NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'No token' } },
      { status: 401 },
    );

  const sessionExpired = (): NextResponse => {
    const response = NextResponse.json(
      {
        error: {
          code: 'SESSION_EXPIRED',
          message: 'Tu sesión ha expirado. Vuelve a iniciar sesión.',
        },
      },
      { status: 401 },
    );
    response.cookies.delete(config.jwtCookieName);
    return response;
  };

  return {
    async GET(request) {
      const token = request.cookies.get(config.jwtCookieName)?.value;
      if (!token) return unauthorized();
      const authResponse = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      if (authResponse.status === 401) return sessionExpired();
      const contentType = authResponse.headers.get('content-type') || '';
      const isJson = contentType.includes('application/json');
      const data = isJson ? await authResponse.json() : await authResponse.text();
      return isJson
        ? NextResponse.json(data, { status: authResponse.status })
        : new NextResponse(data as string, { status: authResponse.status });
    },

    async PATCH(request) {
      const token = request.cookies.get(config.jwtCookieName)?.value;
      if (!token) return unauthorized();
      const body = await request.text();
      const authResponse = await fetch(url, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body,
      });
      if (authResponse.status === 401) return sessionExpired();

      const contentType = authResponse.headers.get('content-type') || '';
      const isJson = contentType.includes('application/json');
      const data = isJson ? await authResponse.json() : await authResponse.text();
      const response = isJson
        ? NextResponse.json(data, { status: authResponse.status })
        : new NextResponse(data as string, { status: authResponse.status });

      if (authResponse.ok && isJson) {
        const lang = pickLanguage(
          (data as { data?: { language?: unknown } })?.data?.language,
        );
        if (lang) {
          // Host-aware: drop the shared Domain when the request host isn't a
          // suffix of it (e.g. the `*.run.app` URL the e2e suite hits), else
          // the browser rejects the Set-Cookie and the reload reads the old
          // language. See effectiveCookieDomain.
          setLanguageCookie(response, lang, {
            ...config.cookieOpts,
            domain: effectiveCookieDomain(
              request.headers.get('host'),
              config.cookieOpts.domain,
            ),
          });
        }
      }

      return response;
    },
  };
}
