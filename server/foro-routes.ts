import { NextResponse, type NextRequest } from 'next/server';

/**
 * Forwarder COMPARTIDO del Foro (chat espejo de Telegram). El backend del Foro lo HOSPEDA
 * un único servicio (Consultor): tiene las rutas `/api/foro/*` (con sesión de usuario), los
 * modelos, el webhook de Telegram y el SSE. Las demás apps NO duplican ese backend: montan
 * un catch-all `/api/foro/[[...path]]` que delega aquí, y este forwarder reenvía la petición
 * al host reutilizando la COOKIE de sesión del usuario (misma `mycolegal-token` en todas las
 * apps del dominio), así el host autentica al MISMO usuario y aplica sus permisos (foro:read…).
 *
 * Es genérico: sirve JSON, SSE en vivo (`/stream`) y binario/multipart (media, avatares) por
 * PASS-THROUGH del cuerpo, sin bufferizar ni reinterpretar el content-type.
 *
 *   // src/app/api/foro/[[...path]]/route.ts   (en cada app consumidora)
 *   import { createForoRoutes } from '@mycolegal-app/ui/server/foro-routes';
 *   export const dynamic = 'force-dynamic';
 *   export const runtime = 'nodejs';
 *   const routes = createForoRoutes({ hostUrl: process.env.FORO_HOST_URL || process.env.CONSULTOR_INTERNAL_URL || '' });
 *   export const { GET, POST, PUT, PATCH, DELETE } = routes;
 */
export interface ForoRoutesOptions {
  /** URL interna del host del Foro (Consultor), p.ej. http://consultor:3000 */
  hostUrl: string;
}

type CatchAllCtx = { params: Promise<{ path?: string[] }> };

export function createForoRoutes(opts: ForoRoutesOptions) {
  async function handler(request: NextRequest, ctx: CatchAllCtx): Promise<NextResponse> {
    if (!opts.hostUrl) {
      return NextResponse.json({ error: { code: 'NOT_AVAILABLE', message: 'El Foro no está configurado en este entorno' } }, { status: 503 });
    }
    const { path } = await ctx.params;
    const sub = path?.length ? `/${path.join('/')}` : '';
    const target = `${opts.hostUrl.replace(/\/$/, '')}/api/foro${sub}${request.nextUrl.search}`;
    const method = request.method;

    // Reenviamos la COOKIE de sesión (autentica al usuario en el host) + accept/content-type.
    const headers: Record<string, string> = {};
    const cookie = request.headers.get('cookie'); if (cookie) headers['cookie'] = cookie;
    const accept = request.headers.get('accept'); if (accept) headers['accept'] = accept;
    const contentType = request.headers.get('content-type'); if (contentType) headers['content-type'] = contentType;
    const wantsStream = accept?.includes('text/event-stream') ?? false;

    const init: RequestInit & { duplex?: 'half' } = {
      method,
      headers,
      redirect: 'manual',
      // El SSE en vivo puede estar abierto minutos; el resto es rápido. EventSource
      // reconecta si se corta, así que un techo largo es seguro.
      signal: AbortSignal.timeout(wantsStream ? 600000 : 30000),
    };
    if (method !== 'GET' && method !== 'HEAD' && request.body) {
      // Cuerpo tal cual (JSON o multipart de subida de media) por streaming.
      init.body = request.body;
      init.duplex = 'half';
    }

    let upstream: Response;
    try {
      upstream = await fetch(target, init);
    } catch {
      return NextResponse.json({ error: { code: 'FORO_ERROR', message: 'No se pudo contactar con el Foro' } }, { status: 502 });
    }

    // PASS-THROUGH del cuerpo (JSON, SSE o binario) preservando el content-type y la
    // disposición; en streaming, cabeceras anti-buffer para que el SSE fluya.
    const outHeaders: Record<string, string> = {
      'Content-Type': upstream.headers.get('content-type') || 'application/octet-stream',
    };
    const cd = upstream.headers.get('content-disposition'); if (cd) outHeaders['Content-Disposition'] = cd;
    const cc = upstream.headers.get('cache-control'); if (cc) outHeaders['Cache-Control'] = cc;
    if (wantsStream) {
      outHeaders['Cache-Control'] = 'no-cache, no-transform';
      outHeaders['X-Accel-Buffering'] = 'no';
    }
    return new NextResponse(upstream.body, { status: upstream.status, headers: outHeaders });
  }

  return { GET: handler, POST: handler, PUT: handler, PATCH: handler, DELETE: handler };
}
