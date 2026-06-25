import { type NextRequest } from 'next/server';

// --------------------------------------------------------------------------
// Host-aware cookie domain resolution
// --------------------------------------------------------------------------
//
// Auth/session/language cookies are configured with a shared parent domain
// (`.mycolegal.app`, `.test.mycolegal.app`) so a single login is valid across
// every app subdomain. But the browser silently DROPS a `Set-Cookie` whose
// `Domain` attribute is not a suffix of the request host — RFC 6265 §5.3. That
// is exactly what happens when an app is reached on a host outside that parent
// domain: the raw `*.run.app` Cloud Run URL the e2e suite hits, a preview URL,
// or any direct-to-revision access. The cookie never lands, so the feature that
// depends on it (e.g. the language toggle reload) appears broken.
//
// `effectiveCookieDomain` returns the configured domain only when the request
// host actually belongs to it; otherwise it returns `undefined`, which makes
// the caller emit a host-only cookie (no `Domain`). Host-only cookies are
// accepted by every host, so the cookie always lands. On real prod/preprod the
// host does belong to the parent domain, the shared `Domain` is preserved, and
// cross-subdomain SSO keeps working exactly as before.

/**
 * Resolve the effective `Domain` cookie attribute for a request.
 *
 * @param requestHost the `Host` header value (may include `:port`), or null
 * @param domain      the configured shared cookie domain, or undefined
 * @returns the domain to use, or `undefined` for a host-only cookie
 */
export function effectiveCookieDomain(
  requestHost: string | null | undefined,
  domain: string | undefined,
): string | undefined {
  if (!domain) return undefined;
  if (!requestHost) return domain;
  const host = requestHost.split(':')[0].toLowerCase();
  const bare = (domain.startsWith('.') ? domain.slice(1) : domain).toLowerCase();
  // The browser accepts `Domain=bare` for the apex (`host === bare`) and any
  // subdomain (`host` ends with `.bare`). Anything else would be rejected, so
  // fall back to a host-only cookie instead.
  if (host === bare || host.endsWith('.' + bare)) return domain;
  return undefined;
}

/** Convenience wrapper that reads the host straight off a NextRequest. */
export function effectiveCookieDomainFor(
  request: NextRequest,
  domain: string | undefined,
): string | undefined {
  return effectiveCookieDomain(request.headers.get('host'), domain);
}
