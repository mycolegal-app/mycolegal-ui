// Runtime cliente genérico para ejecutar "recetas" de integración local
// (las devuelve el hub `facturae`) contra sistemas en la LAN de la notaría.
//
//   HTTP_DIRECT     → fetch directo desde el navegador a un target de la LAN
//                     que admita CORS.
//   AGENTE_HTTP     → `proxy` vía el conector local (extensión + native
//                     messaging): HTTP a la LAN sin CORS. Ver connector/ (A2).
//   AGENTE_COMANDO  → `exec` de un comando whitelisted vía el conector. La
//                     plantilla va FIRMADA (ed25519); el host la verifica,
//                     comprueba allowlist + aprobación y ejecuta sin shell.
//
// El puente página↔extensión es `window.postMessage` (marca `__mycolegal`); el
// content script lo relé al background y este al native host. Ver
// connector/README.md y mycolegal-platform/PLAN_INTEGRACION_LOCAL.md §A.
//
// Módulo puro (sin React/Next/Prisma): se importa como
// `@mycolegal-app/ui/lib/local-integration`.

export type TransporteIntegracion = 'HTTP_DIRECT' | 'AGENTE_HTTP' | 'AGENTE_COMANDO';

export interface PlantillaPeticion {
  method?: string;
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
}

/** Plantilla de comando para AGENTE_COMANDO: la definición firmada + cómo
 *  construir los params (cada valor es un template `{{inputKey}}`). */
export interface PlantillaComando {
  /** base64 de los bytes JSON canónicos de la plantilla `exec` firmada. */
  signed_blob: string;
  /** firma ed25519 (base64) sobre `signed_blob`. */
  signature: string;
  /** nombre-de-param → plantilla `{{inputKey}}` resuelta contra `inputs`. */
  params?: Record<string, string>;
}

export interface RecetaIntegracion {
  transporte: TransporteIntegracion;
  /** HTTP_DIRECT/AGENTE_HTTP → PlantillaPeticion; AGENTE_COMANDO → PlantillaComando. */
  requestTemplate: PlantillaPeticion | PlantillaComando;
  /** campo normalizado → ruta (dot-path) dentro de la respuesta del target. */
  responseMapping: Record<string, string>;
}

export type ResultadoIntegracion =
  | { ok: true; data: Record<string, unknown>; raw: unknown }
  | { ok: false; reason: string; detail?: string };

export async function ejecutarIntegracionLocal(
  receta: RecetaIntegracion,
  inputs: Record<string, unknown>,
  opts?: { timeoutMs?: number },
): Promise<ResultadoIntegracion> {
  const timeoutMs = opts?.timeoutMs ?? 8000;
  switch (receta.transporte) {
    case 'HTTP_DIRECT':
      return ejecutarHttpDirect(receta, inputs, timeoutMs);
    case 'AGENTE_HTTP':
      return ejecutarAgenteHttp(receta, inputs, timeoutMs);
    case 'AGENTE_COMANDO':
      return ejecutarAgenteComando(receta, inputs, timeoutMs);
    default:
      return { ok: false, reason: 'transporte-desconocido', detail: String(receta.transporte) };
  }
}

// ── HTTP_DIRECT: fetch del navegador (target con CORS) ──────────────────────
async function ejecutarHttpDirect(
  receta: RecetaIntegracion,
  inputs: Record<string, unknown>,
  timeoutMs: number,
): Promise<ResultadoIntegracion> {
  const req = aplicarPlantilla(receta.requestTemplate, inputs) as PlantillaPeticion;
  if (!req || !req.url) {
    return { ok: false, reason: 'receta-invalida', detail: 'url vacía' };
  }
  const method = (req.method ?? 'POST').toUpperCase();
  try {
    const res = await fetch(req.url, {
      method,
      headers: { 'Content-Type': 'application/json', ...(req.headers ?? {}) },
      body: method === 'GET' || method === 'HEAD' ? undefined : JSON.stringify(req.body ?? {}),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const raw: unknown = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false,
        reason: `http-${res.status}`,
        detail: typeof raw === 'string' ? raw : JSON.stringify(raw).slice(0, 200),
      };
    }
    return { ok: true, data: mapear(raw, receta.responseMapping), raw };
  } catch (err) {
    const isTimeout = err instanceof DOMException && err.name === 'TimeoutError';
    return {
      ok: false,
      reason: isTimeout ? 'timeout' : 'network-error',
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

// ── AGENTE_HTTP: `proxy` vía el conector ────────────────────────────────────
async function ejecutarAgenteHttp(
  receta: RecetaIntegracion,
  inputs: Record<string, unknown>,
  timeoutMs: number,
): Promise<ResultadoIntegracion> {
  const req = aplicarPlantilla(receta.requestTemplate, inputs) as PlantillaPeticion;
  if (!req || !req.url) {
    return { ok: false, reason: 'receta-invalida', detail: 'url vacía' };
  }
  const res = await llamarAgente('proxy', req, timeoutMs);
  if (!res.ok) return res;
  const r = res.data as { status?: number; body?: string };
  if (typeof r.status === 'number' && r.status >= 400) {
    return { ok: false, reason: `http-${r.status}`, detail: (r.body ?? '').slice(0, 200) };
  }
  // El cuerpo viene como string; intentamos parsear JSON para el responseMapping.
  let raw: unknown = r.body;
  if (typeof r.body === 'string') {
    try {
      raw = JSON.parse(r.body);
    } catch {
      raw = r.body;
    }
  }
  return { ok: true, data: mapear(raw, receta.responseMapping), raw };
}

// ── AGENTE_COMANDO: `exec` (plantilla firmada) vía el conector ──────────────
async function ejecutarAgenteComando(
  receta: RecetaIntegracion,
  inputs: Record<string, unknown>,
  timeoutMs: number,
): Promise<ResultadoIntegracion> {
  const tpl = receta.requestTemplate as PlantillaComando;
  if (!tpl || !tpl.signed_blob || !tpl.signature) {
    return { ok: false, reason: 'receta-invalida', detail: 'falta signed_blob/signature' };
  }
  // Resolver los params (cada valor es un template contra inputs).
  const params: Record<string, string> = {};
  for (const [k, v] of Object.entries(tpl.params ?? {})) {
    params[k] = String(aplicarPlantilla(v, inputs));
  }
  const res = await llamarAgente(
    'exec',
    { signed_blob: tpl.signed_blob, signature: tpl.signature, params },
    timeoutMs,
  );
  if (!res.ok) return res;
  return { ok: true, data: mapear(res.data, receta.responseMapping), raw: res.data };
}

// ── Puente con la extensión (window.postMessage ↔ content script) ───────────
function nuevoId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  return c?.randomUUID?.() ?? `mc-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

interface RespuestaPuente {
  ok: boolean;
  data?: unknown;
  reason?: string;
  detail?: string;
}

async function llamarAgente(
  kind: 'proxy' | 'exec' | 'ping',
  payload: unknown,
  timeoutMs: number,
): Promise<ResultadoIntegracion> {
  if (typeof window === 'undefined') {
    return { ok: false, reason: 'sin-navegador', detail: 'AGENTE_* requiere navegador' };
  }
  const id = nuevoId();
  return new Promise<ResultadoIntegracion>((resolve) => {
    let done = false;
    const cleanup = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      window.removeEventListener('message', onMsg);
    };
    const onMsg = (ev: MessageEvent) => {
      if (ev.source !== window) return;
      const d = ev.data as { __mycolegal?: boolean; dir?: string; id?: string } & RespuestaPuente;
      if (!d || d.__mycolegal !== true || d.dir !== 'res' || d.id !== id) return;
      cleanup();
      if (d.ok) {
        resolve({ ok: true, data: (d.data as Record<string, unknown>) ?? {}, raw: d.data });
      } else {
        resolve({ ok: false, reason: d.reason ?? 'agente-error', detail: d.detail });
      }
    };
    // Margen extra sobre el timeout del host para no cortar antes que él.
    const timer = setTimeout(() => {
      cleanup();
      resolve({ ok: false, reason: 'conector-no-disponible', detail: 'sin respuesta del conector' });
    }, timeoutMs + 2000);
    window.addEventListener('message', onMsg);
    window.postMessage({ __mycolegal: true, dir: 'req', id, kind, payload }, window.location.origin);
  });
}

// ── Helpers de plantilla/mapeo ──────────────────────────────────────────────

// Sustituye `{{clave}}` por inputs[clave] en strings; recursivo en objetos/arrays.
function aplicarPlantilla(value: unknown, inputs: Record<string, unknown>): unknown {
  if (typeof value === 'string') {
    return value.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_m, k: string) => {
      const v = getPath(inputs, k);
      return v === undefined || v === null ? '' : String(v);
    });
  }
  if (Array.isArray(value)) return value.map((v) => aplicarPlantilla(v, inputs));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = aplicarPlantilla(v, inputs);
    }
    return out;
  }
  return value;
}

// Aplica el responseMapping (campo → dot-path) sobre la respuesta normalizada.
function mapear(raw: unknown, responseMapping: Record<string, string>): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const [campo, path] of Object.entries(responseMapping ?? {})) {
    data[campo] = getPath(raw, path);
  }
  return data;
}

// Lee 'a.b.c' de un objeto anidado.
function getPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}
