// Mensaje de error de API unificado y explicativo para los componentes
// compartidos. Patrón único en toda la UI:
//
//   1. Código conocido (error.code) → mensaje LOCALIZADO `ui.errors.<CODE>`.
//   2. Si no, mensaje del backend (error.message) → se muestra tal cual,
//      PORQUE está redactado para el usuario… salvo en 5xx 500, que pueden
//      filtrar detalles internos de configuración.
//   3. Si no, el `fallback` contextual que pase el componente (p.ej. "no se
//      pudieron guardar los permisos") o, en su defecto, un genérico localizado.
//
// Así los errores son más explicativos sin perder ni el contexto del componente
// ni la localización. Para fallos de red (fetch que lanza), usar el código
// sintético "NETWORK" → `apiErrorMessage(t, { code: "NETWORK" }, fallback)`.

export type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

export interface ApiErrorInfo {
  /** HTTP status de la respuesta (cuando lo haya). */
  status?: number;
  /** `error.code` del cuerpo de la respuesta. */
  code?: string | null;
  /** `error.message` del cuerpo de la respuesta. */
  message?: string | null;
}

/**
 * Códigos con mensaje localizado propio (`ui.errors.<CODE>`). Deliberadamente NO
 * incluimos `VALIDATION_ERROR` ni `ASSISTANT_ERROR`: su `error.message` ya es
 * específico/útil (campo concreto, motivo concreto) y debe prevalecer.
 */
const LOCALIZED_CODES = new Set([
  "NETWORK",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "RATE_LIMITED",
  "SUBSCRIPTION_REQUIRED",
  "NOT_AVAILABLE",
  "CONFLICT",
  "PAYLOAD_TOO_LARGE",
]);

/**
 * Resuelve el mensaje a mostrar al usuario ante un error de API.
 * @param fallback Mensaje contextual del componente para el caso "sin código
 *   conocido y sin mensaje de servidor" (recomendado: localizado vía `t`).
 */
export function apiErrorMessage(t: TranslateFn, info: ApiErrorInfo, fallback?: string): string {
  const code = typeof info.code === "string" ? info.code.toUpperCase() : "";
  if (code && LOCALIZED_CODES.has(code)) return t(`ui.errors.${code}`);

  const serverMsg = typeof info.message === "string" ? info.message.trim() : "";
  if (serverMsg && info.status !== 500) return serverMsg;

  return fallback || t("ui.errors.generic");
}

/**
 * Igual que `apiErrorMessage` pero leyendo el cuerpo `{ error: { code, message } }`
 * de una `Response` no-OK. No lanza: si el cuerpo no es JSON, cae al fallback.
 */
export async function apiErrorFromResponse(
  t: TranslateFn,
  res: Response,
  fallback?: string,
): Promise<string> {
  const json = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
  return apiErrorMessage(
    t,
    { status: res.status, code: json?.error?.code, message: json?.error?.message },
    fallback,
  );
}
