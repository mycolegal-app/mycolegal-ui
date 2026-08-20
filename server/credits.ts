import { NextResponse, type NextRequest } from 'next/server';

/**
 * Cliente y proxy del monedero de créditos de IA (owner: mycolegal-platform).
 *
 * Dos piezas:
 *  - `createCreditsClient`: helper server-side `withCredits(...)` que envuelve
 *    TODA llamada de IA → precheck (bloqueo barato) → ejecuta la llamada →
 *    consume (liquida el coste con los tokens reales). Lo usan las API routes de
 *    cada app que invocan IA.
 *  - `createCreditsRoutes`: proxy `/api/credits/balance` para que la UI pinte el
 *    saldo del monedero. Fuerza el orgId de la sesión (un usuario solo ve su org).
 *
 * Igual que billing, platform vive detrás de X-Service-Key: NO se reenvía el JWT.
 */

export class InsufficientCreditsError extends Error {
  constructor(public balance: number) {
    super('Sin créditos de IA suficientes');
    this.name = 'InsufficientCreditsError';
  }
}

export interface CreditsClientConfig {
  /** Base URL interna de mycolegal-platform. */
  platformUrl: string;
  /** X-Service-Key (APPS_REGISTER_SECRET). */
  serviceKey: string;
  /** appSlug de quien consume (atribución por app en el libro mayor). */
  app: string;
}

export interface Usage {
  model?: string | null;
  tokensIn?: number | null;
  tokensOut?: number | null;
}

export interface WithCreditsCtx {
  orgId: string;
  actionKey: string;
  userId?: string | null;
}

export function createCreditsClient(config: CreditsClientConfig) {
  const base = config.platformUrl.replace(/\/$/, '');

  async function call<T>(path: string, init: { method: string; body?: unknown }): Promise<T> {
    const res = await fetch(`${base}/internal/credits/${path}`, {
      method: init.method,
      headers: { 'Content-Type': 'application/json', 'X-Service-Key': config.serviceKey },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
    if (!res.ok) throw new Error(`credits/${path} → ${res.status}`);
    return (await res.json()) as T;
  }

  async function precheck(orgId: string): Promise<{ balance: number; blocked: boolean }> {
    return call('precheck', { method: 'POST', body: { orgId } });
  }

  async function consume(
    input: WithCreditsCtx & Usage,
  ): Promise<{ creditsCharged: number; balanceAfter: number; blocked: boolean }> {
    return call('consume', { method: 'POST', body: { ...input, app: config.app } });
  }

  async function getBalance(orgId: string) {
    return call(`balance?orgId=${encodeURIComponent(orgId)}`, { method: 'GET' });
  }

  /**
   * Envuelve una llamada de IA cobrando créditos: bloquea ANTES si no hay saldo
   * (descubierto de cortesía incluido), ejecuta `fn`, y liquida DESPUÉS con los
   * tokens reales que `fn` reporte. El cargo es best-effort: si la liquidación
   * falla, la operación NO se rompe (la llamada de IA ya se hizo); se registra.
   *
   * `fn` devuelve `{ value, usage? }`; `usage` solo hace falta para acciones
   * medidas por tokens (meterMode=tokens). Las de precio fijo lo ignoran.
   */
  async function withCredits<T>(
    ctx: WithCreditsCtx,
    fn: () => Promise<{ value: T; usage?: Usage }>,
  ): Promise<T> {
    const pre = await precheck(ctx.orgId);
    if (pre.blocked) throw new InsufficientCreditsError(pre.balance);

    const { value, usage } = await fn();

    try {
      await consume({ ...ctx, ...(usage ?? {}) });
    } catch (err) {
      // Contabilidad best-effort: no romper la operación del usuario.
      console.error('[credits] consume failed', { actionKey: ctx.actionKey, err });
    }
    return value;
  }

  return { precheck, consume, getBalance, withCredits };
}

// --- Proxy de saldo para la UI (GET /api/credits/balance) -------------------

export interface CreditsRoutesConfig {
  platformUrl: string;
  serviceKey: string;
  /** withSession/withAuth de la app: rellena context.auth (orgId + rol/permisos). */
  withAuth: (handler: CreditsHandler) => CreditsHandler;
}

// El proxy recibe el AuthContext completo de la app (orgId + rol cross-app +
// permisos). Tipamos solo lo que usamos; en runtime la app inyecta el resto.
type CreditsAuth = { orgId: string; authRole?: string; permissions?: string[] };
type CreditsContext = { params: Promise<{ path?: string[] }>; auth: CreditsAuth };
type CreditsHandler = (request: NextRequest, context: CreditsContext) => Promise<Response>;

/**
 * ¿El usuario puede administrar la org (y por tanto comprar créditos)? Mismo
 * criterio que el hook `useIsOrgAdmin` del cliente: rol cross-app org_admin/
 * superadmin, o permiso de administración de usuarios / comodín. Sirve para
 * gatear las escrituras de forma uniforme SIN depender del catálogo de permisos
 * de cada app (evita el drift `billing:write` app-a-app).
 */
function canManageBilling(auth: CreditsAuth): boolean {
  const role = auth.authRole;
  const perms = auth.permissions ?? [];
  return (
    role === 'org_admin' ||
    role === 'superadmin' ||
    perms.includes('admin:users') ||
    perms.includes('admin:*') ||
    perms.includes('*')
  );
}

export function createCreditsRoutes(config: CreditsRoutesConfig) {
  const base = config.platformUrl.replace(/\/$/, '');

  // Lecturas (cualquier usuario de la org): saldo del monedero y catálogo de packs.
  // El saldo se pinta en la cabecera de todas las apps; los packs son catálogo
  // (nombre/precio), no dato sensible.
  const GET = config.withAuth(async (_request, context) => {
    const orgId = context.auth.orgId;
    const op = (await context.params).path?.[0] ?? 'balance';
    const path =
      op === 'balance'
        ? '/internal/credits/balance'
        : op === 'packs'
          ? '/internal/billing/packs'
          : null;
    if (!path) return NextResponse.json({ error: { code: 'NOT_FOUND' } }, { status: 404 });
    const res = await fetch(`${base}${path}?orgId=${encodeURIComponent(orgId)}`, {
      headers: { 'X-Service-Key': config.serviceKey },
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  });

  // Escrituras (SOLO org_admin): iniciar la compra de un pack. Se valida el rol
  // en el propio proxy (403 si no). `orgId` SIEMPRE de la sesión, nunca del
  // cuerpo del cliente.
  const POST = config.withAuth(async (request, context) => {
    if (!canManageBilling(context.auth)) {
      return NextResponse.json({ error: { code: 'FORBIDDEN' } }, { status: 403 });
    }
    const orgId = context.auth.orgId;
    const op = (await context.params).path?.[0];
    const target =
      op === 'checkout'
        ? '/internal/billing/credit-checkout'
        : op === 'purchase'
          ? '/internal/billing/credit-purchase'
          : null;
    if (!target) return NextResponse.json({ error: { code: 'NOT_FOUND' } }, { status: 404 });
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const res = await fetch(`${base}${target}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Service-Key': config.serviceKey },
      body: JSON.stringify({ ...body, orgId }),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  });

  return { catchAll: { GET, POST } };
}
