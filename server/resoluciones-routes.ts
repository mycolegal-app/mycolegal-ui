import { NextResponse, type NextRequest } from 'next/server';

/**
 * Reenvío del proxy de MycoBot/Resoluciones hacia Consultor. El corpus de
 * resoluciones es GLOBAL y lo gobierna Consultor; cada app monta UN catch-all
 * `/api/resoluciones/[[...path]]` que, tras resolver su propia sesión, delega
 * aquí. Reenvía a `/api/inter/resoluciones/*` con:
 *
 *   X-Service-Key  — secreto inter-app (confianza servicio-a-servicio)
 *   X-Org-Id       — org del usuario (entitlement/auditoría; NO filtra el corpus)
 *   X-User-Id      — identidad global del usuario (authUserId) para acotar el
 *                    historial de conversación por usuario
 *
 * El shim de cada app (ver más abajo) usa su `withAuth` para obtener orgId/userId
 * verificados del JWT — por eso la verificación vive en la app y aquí solo
 * reenviamos. Cubre todos los sub-paths que usa el rail: `ask` (POST),
 * `conversaciones`, `conversaciones/:id` y `:id` (GET).
 *
 *   // src/app/api/resoluciones/[[...path]]/route.ts
 *   import { withAuth, errorResponse } from '@/lib/api-utils';
 *   import { forwardResoluciones } from '@mycolegal-app/ui/server/resoluciones-routes';
 *
 *   const CONSULTOR_URL = process.env.CONSULTOR_INTERNAL_URL || '';
 *   const INTER_SERVICE_KEY = process.env.INTER_SERVICE_KEY || '';
 *
 *   const handler = withAuth(async (request, { auth, params }) => {
 *     if (!CONSULTOR_URL || !INTER_SERVICE_KEY) {
 *       return errorResponse('NOT_AVAILABLE', 'El asistente no está configurado en este entorno', 503);
 *     }
 *     const { path } = await params;
 *     return forwardResoluciones({
 *       consultorUrl: CONSULTOR_URL, serviceKey: INTER_SERVICE_KEY,
 *       orgId: auth.orgId, userId: auth.authUserId, path, request,
 *     });
 *   });
 *   export const GET = handler;
 *   export const POST = handler;
 */
export interface ForwardResolucionesParams {
  consultorUrl: string;
  serviceKey: string;
  orgId: string;
  userId: string;
  path?: string[];
  request: NextRequest;
}

export async function forwardResoluciones(p: ForwardResolucionesParams): Promise<NextResponse> {
  const segs = p.path ?? [];
  const sub = segs.length ? `/${segs.join('/')}` : '';
  const url = `${p.consultorUrl.replace(/\/$/, '')}/api/inter/resoluciones${sub}${p.request.nextUrl.search}`;

  const method = p.request.method;
  // El chat de MycoBot pide streaming (SSE) para ver los pasos del bucle agéntico:
  // en ese modo NO bufferizamos y damos margen amplio de tiempo (el turno agéntico
  // puede tardar decenas de segundos; el buffered+30s era justo lo que mataba la
  // respuesta y dejaba el "No se pudo contactar").
  const wantsStream = p.request.headers.get('accept')?.includes('text/event-stream') ?? false;
  const headers: Record<string, string> = {
    'X-Service-Key': p.serviceKey,
    'X-Org-Id': p.orgId,
    'X-User-Id': p.userId,
  };
  if (wantsStream) headers['Accept'] = 'text/event-stream';
  // Reenvía el JWT del usuario (cookie SSO) como X-User-Token. Habilita el modo
  // AGENTE de MycoBot: Consultor lo usa para consultar la API de la app (p.ej.
  // Notaría) en nombre del usuario, respetando sus permisos. Servicio-a-servicio
  // por red interna; el navegador ya tiene esta cookie.
  const userToken = p.request.cookies.get((process.env.COOKIE_PREFIX || '') + 'mycolegal-token')?.value;
  if (userToken) headers['X-User-Token'] = userToken;
  const init: RequestInit = { method, headers, signal: AbortSignal.timeout(wantsStream ? 120000 : 30000) };
  if (method !== 'GET' && method !== 'HEAD') {
    headers['Content-Type'] = 'application/json';
    init.body = await p.request.text();
  }

  try {
    const upstream = await fetch(url, init);
    // Streaming: devolvemos el cuerpo SSE tal cual, sin leerlo entero (pass-through).
    // NextResponse (no Response) para que las rutas catch-all envueltas en withAuth
    // —que exigen NextResponse— tipen correctamente. Acepta ReadableStream como body.
    if (wantsStream && upstream.body) {
      return new NextResponse(upstream.body, {
        status: upstream.status,
        headers: {
          'Content-Type': upstream.headers.get('content-type') || 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          'X-Accel-Buffering': 'no',
        },
      });
    }
    const text = await upstream.text();
    return new NextResponse(text, {
      status: upstream.status,
      headers: { 'Content-Type': upstream.headers.get('content-type') || 'application/json' },
    });
  } catch {
    return NextResponse.json(
      { error: { code: 'ASSISTANT_ERROR', message: 'No se pudo contactar con el asistente' } },
      { status: 502 },
    );
  }
}
