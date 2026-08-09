import { NextResponse, type NextRequest } from 'next/server';
import { OAuth2Client } from 'google-auth-library';

/**
 * Factory de `job_endpoints` para apps consumidoras del sistema genérico de jobs
 * (ver mycolegal-platform/PLAN_TECNICO_JOBS.md). Es el lado RECEPTOR: recibe las
 * invocaciones del motor de auth, **verifica el OIDC** (única capa de identidad,
 * §11) y despacha al handler registrado. NO es un proxy.
 *
 * Garantía estructural (§11.1): toda tarea se registra como `handler` aquí y se
 * monta por UN único catch-all gated; un guard de CI prohíbe rutas de job fuera
 * de él. El catálogo a publicar en auth se deriva de los mismos handlers
 * (`catalog()`), así "publicado == gated".
 *
 *   // src/lib/jobs-server.ts
 *   import { createJobEndpointRoutes } from '@mycolegal-app/ui/server/job-endpoints';
 *   export const jobRoutes = createJobEndpointRoutes({
 *     appSlug: 'consultor',
 *     selfUrl: SELF_SERVICE_URL,           // mycolegal-<app>-service-url
 *     callerServiceAccount: JOBS_CALLER_SA, // SA de auth
 *     endpoints: [{ key: 'ingesta-resoluciones', name: '…', handler: ingesta }],
 *   });
 *
 *   // src/app/api/internal/jobs/[[...path]]/route.ts
 *   import { jobRoutes } from '@/lib/jobs-server';
 *   export const { POST } = jobRoutes.catchAll;
 *
 *   // instrumentation.node.ts (registro): jobEndpoints: jobRoutes.catalog()
 */

/** Prefijo canónico (incluye /api) bajo el que se montan los job_endpoints. */
const JOB_PATH_PREFIX = '/api/internal/jobs';

/** URL absoluta de invocación — usada por el registro Y por la verificación de
 *  audience, para que ambos lados construyan exactamente la misma cadena. */
export function jobEndpointInvokeUrl(selfUrl: string, key: string): string {
  return `${selfUrl.replace(/\/$/, '')}${JOB_PATH_PREFIX}/${key}`;
}

export interface JobHandlerCtx {
  /** Params de la invocación (defaultParams + override del schedule/run). */
  params: Record<string, unknown>;
  /** Punto de reanudación del run troceado (null en el primer trozo). */
  cursor: string | null;
  request: NextRequest;
}

/**
 * Resultado de un trozo. Para tareas largas, devuelve este objeto: el motor
 * reinvoca con el `cursor` hasta `done:true`, mostrando `progress` en vivo y
 * acumulando `metrics` (delta por trozo). Para tareas cortas (one-shot), basta
 * devolver un objeto plano de métricas (sin `done`): el motor lo trata como
 * `done` en un solo trozo.
 */
export interface JobChunkResult {
  done: boolean;
  cursor?: string;
  progress?: { message?: string; current?: number; total?: number };
  metrics?: Record<string, unknown>;
}

export type JobHandler = (ctx: JobHandlerCtx) => Promise<unknown> | unknown;

/**
 * Convención de `paramsSchema` (ligera, NO es JSON-Schema completo): describe los
 * parámetros que admite un job para que admin pueda pintar un formulario amable en
 * lugar de un textarea de JSON crudo. Si un endpoint no la declara, admin cae al
 * editor JSON. `admin` la interpreta en jobs/paramsSchema.ts.
 */
export type JobFieldType = 'string' | 'number' | 'boolean' | 'enum' | 'date';

export interface JobFieldSpec {
  /** Clave del parámetro en el objeto params. */
  key: string;
  /** Etiqueta legible para el formulario. */
  label: string;
  type: JobFieldType;
  required?: boolean;
  /** Opciones para type 'enum'. `label` opcional (por defecto = value). */
  enum?: { value: string; label?: string }[];
  /** Valor por defecto sugerido (independiente de defaultParams del endpoint). */
  default?: unknown;
  /** Texto de ayuda mostrado bajo el campo. */
  help?: string;
  placeholder?: string;
}

export interface JobParamsSchema {
  fields: JobFieldSpec[];
}

export interface JobEndpointDef {
  key: string;
  name: string;
  description?: string;
  defaultParams?: Record<string, unknown>;
  /** Descripción de params para el formulario de admin (ver JobParamsSchema). */
  paramsSchema?: JobParamsSchema;
  /** Timeout que auth aplica a la invocación. Default 600 s. */
  timeoutSeconds?: number;
  handler: JobHandler;
}

export interface JobEndpointsConfig {
  appSlug: string;
  /** URL pública de ESTE servicio (su secret mycolegal-<app>-service-url). */
  selfUrl: string;
  /** Email(s) de la SA de auth — la ÚNICA autorizada a invocar. */
  callerServiceAccount: string | string[];
  endpoints: JobEndpointDef[];
}

const oauthClient = new OAuth2Client();

export function createJobEndpointRoutes(config: JobEndpointsConfig) {
  const selfUrl = config.selfUrl.replace(/\/$/, '');
  const byKey = new Map(config.endpoints.map((e) => [e.key, e]));
  const allowedSAs = new Set(
    (Array.isArray(config.callerServiceAccount) ? config.callerServiceAccount : [config.callerServiceAccount])
      .filter(Boolean),
  );

  /** Verifica el ID token OIDC: firma Google + audience exacta + email == SA de auth. */
  async function verifyCaller(
    request: NextRequest,
    key: string,
  ): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
    const authz = request.headers.get('authorization') ?? '';
    const m = /^Bearer (.+)$/i.exec(authz);
    if (!m) return { ok: false, status: 401, error: 'Missing bearer token' };
    try {
      const ticket = await oauthClient.verifyIdToken({
        idToken: m[1],
        audience: jobEndpointInvokeUrl(selfUrl, key),
      });
      const payload = ticket.getPayload();
      if (!payload?.email || !payload.email_verified || !allowedSAs.has(payload.email)) {
        // Log diagnóstico (servidor): qué SA llegó vs la(s) esperada(s). Sin esto,
        // "Caller not authorized" no dice qué email poner en JOBS_CALLER_SA.
        console.warn(
          `[job-endpoints] caller rechazado: email=${payload?.email ?? '∅'} ` +
            `verified=${payload?.email_verified ?? false} esperadas=[${[...allowedSAs].join(', ') || '∅ (JOBS_CALLER_SA vacío)'}]`,
        );
        return { ok: false, status: 403, error: 'Caller not authorized' };
      }
      return { ok: true };
    } catch {
      return { ok: false, status: 401, error: 'Invalid token' };
    }
  }

  /** Catálogo para publicar en auth (campo `jobEndpoints` de /apps/register). */
  function catalog() {
    return config.endpoints.map((e) => ({
      key: e.key,
      name: e.name,
      description: e.description,
      invokeUrl: jobEndpointInvokeUrl(selfUrl, e.key),
      method: 'POST' as const,
      paramsSchema: e.paramsSchema,
      defaultParams: e.defaultParams ?? {},
      timeoutSeconds: e.timeoutSeconds ?? 600,
    }));
  }

  async function handle(request: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) {
    const path = (await ctx.params).path ?? [];
    const key = path[0];
    const def = key ? byKey.get(key) : undefined;
    if (!def) return NextResponse.json({ error: 'Unknown job endpoint' }, { status: 404 });

    const auth = await verifyCaller(request, key);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    // El motor invoca con envoltorio { params, cursor }. Compat: un cuerpo plano
    // (sin esas claves) se trata como `params` directamente.
    let params: Record<string, unknown> = {};
    let cursor: string | null = null;
    try {
      const body = (await request.json()) as unknown;
      if (body && typeof body === 'object' && !Array.isArray(body)) {
        const b = body as Record<string, unknown>;
        if ('params' in b || 'cursor' in b) {
          params = b.params && typeof b.params === 'object' && !Array.isArray(b.params) ? (b.params as Record<string, unknown>) : {};
          cursor = typeof b.cursor === 'string' ? b.cursor : null;
        } else {
          params = b;
        }
      }
    } catch {
      /* sin cuerpo / no-JSON: params vacíos */
    }

    try {
      const result = await def.handler({ params, cursor, request });
      return NextResponse.json(result ?? { ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  return {
    /** Catálogo declarado (para registrar en auth). */
    catalog,
    /** Para `export const { POST } = jobRoutes.catchAll` en el `[[...path]]/route.ts`. */
    catchAll: {
      POST(request: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) {
        return handle(request, ctx);
      },
    },
  };
}
