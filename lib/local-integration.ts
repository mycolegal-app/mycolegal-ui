// Runtime cliente genérico para ejecutar "recetas" de integración local
// (las devuelve el hub `facturae`) contra sistemas en la LAN de la notaría.
//
//   A1 → solo `HTTP_DIRECT`: fetch directo desde el navegador a un target de la
//        LAN que admita CORS.
//   A2 → `AGENTE_HTTP` / `AGENTE_COMANDO` vía extensión + native messaging
//        (el conector local). Aquí devuelven `transporte-no-soportado` para que
//        el consumidor caiga a entrada MANUAL hasta que el agente exista.
//
// Módulo puro (sin React/Next/Prisma): se importa como
// `@mycolegal-app/ui/lib/local-integration`. Ver
// mycolegal-platform/PLAN_INTEGRACION_LOCAL.md §A.

export type TransporteIntegracion = 'HTTP_DIRECT' | 'AGENTE_HTTP' | 'AGENTE_COMANDO';

export interface PlantillaPeticion {
  method?: string;
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
}

export interface RecetaIntegracion {
  transporte: TransporteIntegracion;
  requestTemplate: PlantillaPeticion;
  /** campo normalizado → ruta (dot-path) dentro de la respuesta del target. */
  responseMapping: Record<string, string>;
}

export type ResultadoIntegracion =
  | { ok: true; data: Record<string, unknown>; raw: unknown }
  | { ok: false; reason: string; detail?: string };

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

// Lee 'a.b.c' de un objeto anidado.
function getPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}

export async function ejecutarIntegracionLocal(
  receta: RecetaIntegracion,
  inputs: Record<string, unknown>,
  opts?: { timeoutMs?: number },
): Promise<ResultadoIntegracion> {
  if (receta.transporte !== 'HTTP_DIRECT') {
    return {
      ok: false,
      reason: 'transporte-no-soportado',
      detail: `${receta.transporte} requiere el conector local (A2)`,
    };
  }

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
      signal: AbortSignal.timeout(opts?.timeoutMs ?? 8000),
    });
    const raw: unknown = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false,
        reason: `http-${res.status}`,
        detail: typeof raw === 'string' ? raw : JSON.stringify(raw).slice(0, 200),
      };
    }
    const data: Record<string, unknown> = {};
    for (const [campo, path] of Object.entries(receta.responseMapping)) {
      data[campo] = getPath(raw, path);
    }
    return { ok: true, data, raw };
  } catch (err) {
    const isTimeout = err instanceof DOMException && err.name === 'TimeoutError';
    return {
      ok: false,
      reason: isTimeout ? 'timeout' : 'network-error',
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}
