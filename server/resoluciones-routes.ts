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
  const headers: Record<string, string> = {
    'X-Service-Key': p.serviceKey,
    'X-Org-Id': p.orgId,
    'X-User-Id': p.userId,
  };
  const init: RequestInit = { method, headers, signal: AbortSignal.timeout(30000) };
  if (method !== 'GET' && method !== 'HEAD') {
    headers['Content-Type'] = 'application/json';
    init.body = await p.request.text();
  }

  try {
    const upstream = await fetch(url, init);
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
