import { NextResponse, type NextRequest } from 'next/server';

/**
 * Factory del proxy de billing que cada app monta para el **self-service** del
 * administrador de la organización: gestionar las suscripciones de su org (la
 * de la app actual y cualquier otra del catálogo).
 *
 * A diferencia del proxy de incidencias/notificaciones (que reenvía el JWT al
 * servicio auth), billing vive en `mycolegal-platform` detrás de X-Service-Key.
 * Así que aquí NO se reenvía el JWT: la app autentica con su propio
 * `withPermission` (que rellena `context.auth`), y este proxy llama a platform
 * con la service key forzando `orgId = el de la sesión`. Un org-admin solo
 * puede tocar su propia organización; nunca se confía un orgId del cliente.
 *
 * Uso desde una app:
 *
 *   // src/lib/billing-server.ts
 *   import { createBillingRoutes } from '@mycolegal-app/ui/server/billing-routes';
 *   import { withPermission } from '@/lib/api-utils';
 *   import { PLATFORM_INTERNAL_URL, APPS_REGISTER_SECRET } from './config';
 *   export const billingRoutes = createBillingRoutes({
 *     platformUrl: PLATFORM_INTERNAL_URL,
 *     serviceKey: APPS_REGISTER_SECRET,
 *     withPermission: withPermission as never,
 *   });
 *
 *   // src/app/api/billing/[[...path]]/route.ts
 *   import { billingRoutes } from '@/lib/billing-server';
 *   export const { GET, POST } = billingRoutes.catchAll;
 *
 * Endpoints expuestos (bajo /api/billing): GET overview|packs|credit-balance|
 * summary; POST checkout|portal|credit-checkout|suspend|resume|cancel. NO
 * expone `courtesy` — las exenciones son cosa del superadmin desde el panel
 * admin, no del self-service.
 */

export interface BillingRoutesConfig {
  /** Base URL interna de mycolegal-platform (p.ej. http://platform:3101). */
  platformUrl: string;
  /** X-Service-Key para los /internal/billing/* de platform (APPS_REGISTER_SECRET). */
  serviceKey: string;
  /**
   * `withPermission` de la app (firma runtime `(perm) => (handler) => handler`).
   * Gatea a administradores de la organización y rellena `context.auth`.
   */
  withPermission: (permission: string) => (handler: BillingHandler) => BillingHandler;
  /** Permiso que identifica al admin de la org. Por defecto `admin:users`. */
  adminPermission?: string;
}

type BillingContext = { params: Promise<{ path?: string[] }>; auth: { orgId: string } };
type BillingHandler = (request: NextRequest, context: BillingContext) => Promise<Response>;

const SELF_SERVICE_GET = new Set(['overview', 'packs', 'credit-balance', 'summary']);
// `add-app` e `interest` son los que usa el modal de la toolbar (SubscribeAppModal)
// al pulsar una app gris: contratarla, o anotar el interés si aún no es vendible.
// Ambos fuerzan el orgId de la sesión, igual que el resto.
const SELF_SERVICE_POST = new Set([
  'checkout',
  'portal',
  'credit-checkout',
  'suspend',
  'resume',
  'cancel',
  'add-app',
  'interest',
]);

export function createBillingRoutes(config: BillingRoutesConfig) {
  const guard = config.withPermission(config.adminPermission ?? 'admin:users');
  const base = config.platformUrl.replace(/\/$/, '');

  async function forward(
    op: string,
    init: { method: string; body?: unknown; search?: string },
  ): Promise<NextResponse> {
    const res = await fetch(`${base}/internal/billing/${op}${init.search ?? ''}`, {
      method: init.method,
      headers: { 'Content-Type': 'application/json', 'X-Service-Key': config.serviceKey },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  }

  const notFound = () =>
    NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Ruta de billing no soportada' } }, { status: 404 });

  return {
    catchAll: {
      GET: guard(async (_request, context) => {
        const orgId = context.auth.orgId;
        const op = (await context.params).path?.[0] ?? 'overview';
        if (!SELF_SERVICE_GET.has(op)) return notFound();
        return forward(op, { method: 'GET', search: `?orgId=${encodeURIComponent(orgId)}` });
      }),
      POST: guard(async (request, context) => {
        const orgId = context.auth.orgId;
        const op = (await context.params).path?.[0] ?? '';
        if (!SELF_SERVICE_POST.has(op)) return notFound();
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        // El orgId SIEMPRE el de la sesión: un org-admin solo gestiona su org.
        return forward(op, { method: 'POST', body: { ...body, orgId } });
      }),
    },
  };
}
