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
  };
  const fetchOptions: RequestInit = { method, headers };
  if (method !== 'GET' && method !== 'HEAD') {
    const body = options.body ?? (await request.text());
    fetchOptions.body = body;
    // #230/#231 — solo declaramos JSON si REALMENTE hay cuerpo. Enviar
    // `Content-Type: application/json` con cuerpo vacío hace que Fastify
    // rechace con "body cannot be empty" (le pasaba al botón Reabrir
    // incidencia, que hace un POST sin body). Mismo criterio que fetchFromAuth.
    if (typeof body === 'string' && body.length > 0) {
      headers['Content-Type'] = 'application/json';
    }
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
  // Non-JSON (e.g. image/jpeg incident screenshots): pass the raw bytes
  // through with the upstream content-type instead of decoding as text,
  // which corrupts binary. Also forward Cache-Control when present.
  const buffer = await authResponse.arrayBuffer();
  const passthroughHeaders = new Headers();
  if (contentType) passthroughHeaders.set('content-type', contentType);
  const cacheControl = authResponse.headers.get('cache-control');
  if (cacheControl) passthroughHeaders.set('cache-control', cacheControl);
  // Preserve the download filename for attachments (PDF/XLSX/…). Screenshots
  // don't set it, so this stays a no-op for them.
  const disposition = authResponse.headers.get('content-disposition');
  if (disposition) passthroughHeaders.set('content-disposition', disposition);
  return new NextResponse(buffer, {
    status: authResponse.status,
    headers: passthroughHeaders,
  });
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
  const hasBody = options.body !== undefined && options.body !== null && method !== 'GET';
  // Only set Content-Type when we actually send a body. Sending
  // `Content-Type: application/json` on a body-less DELETE/POST tricks
  // Fastify's JSON parser into rejecting the request as "Unexpected end
  // of JSON input" → 400. Observed on
  //   DELETE /orgs/:orgId/users/:userId/permissions/:appSlug
  // which deliberately takes no body.
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (hasBody) headers['Content-Type'] = 'application/json';
  const fetchOptions: RequestInit = { method, headers };
  if (hasBody) {
    fetchOptions.body = JSON.stringify(options.body);
  }
  const res = await fetch(`${config.authInternalUrl}${path}`, fetchOptions);
  const contentType = res.headers.get('content-type') || '';
  const data: unknown = contentType.includes('application/json') ? await res.json() : await res.text();
  return { status: res.status, data };
}
