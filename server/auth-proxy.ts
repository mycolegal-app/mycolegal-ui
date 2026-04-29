import { NextResponse, type NextRequest } from 'next/server';

/**
 * Configuration shared by all auth-proxy helpers.
 * Each consumer app injects its own JWT cookie name and auth base URL.
 */
export interface AuthProxyConfig {
  /** Cookie name carrying the JWT (e.g. `mycolegal-token`). */
  jwtCookieName: string;
  /** Base URL of the auth service in the internal network. */
  authInternalUrl: string;
}

/**
 * Generic proxy: forwards an incoming Next.js request to a path on the
 * auth service, attaching the JWT as a Bearer token. Returns SESSION_EXPIRED
 * and clears the cookie on 401.
 */
export async function proxyToAuth(
  config: AuthProxyConfig,
  request: NextRequest,
  path: string,
  options: { method?: string; body?: string } = {},
): Promise<NextResponse> {
  const token = request.cookies.get(config.jwtCookieName)?.value;

  if (!token) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'No token' } },
      { status: 401 },
    );
  }

  const method = options.method || request.method;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  const fetchOptions: RequestInit = { method, headers };
  if (method !== 'GET' && method !== 'HEAD') {
    fetchOptions.body = options.body ?? (await request.text());
  }

  const authResponse = await fetch(`${config.authInternalUrl}${path}`, fetchOptions);

  if (authResponse.status === 401) {
    const response = NextResponse.json(
      { error: { code: 'SESSION_EXPIRED', message: 'Tu sesión ha expirado. Vuelve a iniciar sesión.' } },
      { status: 401 },
    );
    response.cookies.delete(config.jwtCookieName);
    return response;
  }

  const contentType = authResponse.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const data = await authResponse.json();
    return NextResponse.json(data, { status: authResponse.status });
  }
  const text = await authResponse.text();
  return new NextResponse(text, { status: authResponse.status });
}

/**
 * Direct call to auth from a server context (no incoming request).
 */
export async function fetchFromAuth(
  config: AuthProxyConfig,
  path: string,
  token: string,
  options: { method?: string; body?: unknown } = {},
): Promise<{ status: number; data: unknown }> {
  const method = options.method || 'GET';
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  const fetchOptions: RequestInit = { method, headers };
  if (options.body && method !== 'GET') {
    fetchOptions.body = JSON.stringify(options.body);
  }
  const res = await fetch(`${config.authInternalUrl}${path}`, fetchOptions);
  const contentType = res.headers.get('content-type') || '';
  const data: unknown = contentType.includes('application/json') ? await res.json() : await res.text();
  return { status: res.status, data };
}
