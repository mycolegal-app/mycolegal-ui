"use client";

import { useState, useEffect, useCallback, type FormEvent } from "react";

/**
 * Raw email config payload as stored in `org_email_configs` and as returned
 * by `/api/platform/email-config` and `/api/orgs/:id/email-config`. Strings
 * only so the form can show blanks when unset; the caller converts numeric
 * fields before PUT.
 */
export interface EmailConfigValues {
  smtpHost: string;
  smtpPort: string;
  smtpUser: string;
  smtpPass: string;
  smtpSecure: boolean;
  fromAddress: string;
  fromName: string;
}

export type EmailProvider = "platform" | "resend" | "smtp";

const EMPTY: EmailConfigValues = {
  smtpHost: "",
  smtpPort: "587",
  smtpUser: "",
  smtpPass: "",
  smtpSecure: true,
  fromAddress: "",
  fromName: "",
};

const RESEND_HOST = "smtp.resend.com";
const RESEND_PORT = "465";
const RESEND_USER = "resend";

/**
 * Heuristic over a stored `org_email_configs` row:
 *  - In org scope, an "empty" row (no SMTP host/user/pass and no from
 *    address/name) means "delegate to the platform default" — the backend
 *    already falls back to the system-org config in that case.
 *  - A row pinned to Resend's host + canonical user is Resend.
 *  - Anything else is plain SMTP.
 * The platform scope never has "platform" as an option since it is the
 * platform — so we only collapse to "platform" for org scope.
 */
export function deriveProvider(
  cfg: Partial<EmailConfigValues> | null | undefined,
  scope: "platform" | "org" = "org",
): EmailProvider {
  if (scope === "org") {
    const noSmtp = !cfg?.smtpHost && !cfg?.smtpUser && !cfg?.smtpPass;
    const noFrom = !cfg?.fromAddress && !cfg?.fromName;
    if (!cfg || (noSmtp && noFrom)) return "platform";
  }
  if (cfg?.smtpHost === RESEND_HOST && (cfg?.smtpUser ?? "") === RESEND_USER) return "resend";
  return "smtp";
}

export interface EmailConfigFormProps {
  /** "platform" (system-org default) vs "org" (per-org override). Affects copy + placeholders. */
  scope: "platform" | "org";
  /** Initial config as returned by the API (nullable fields stringified). */
  initial?: Partial<EmailConfigValues> | null;
  /** Labeled "Guardando…" while true. */
  saving?: boolean;
  /** Disable the whole form (loading state). */
  loading?: boolean;
  /**
   * Platform (system-org) sender shown in the "global provider" note when
   * the org delegates to it. Ignored when scope === "platform".
   */
  platformSender?: { fromAddress: string | null; fromName: string | null };
  /**
   * Persist handler. Receives the values in Resend-or-SMTP shape ready for
   * the PUT payload — numeric port as string, empty strings for empty
   * fields (caller converts to null before sending).
   */
  onSave: (values: EmailConfigValues) => void | Promise<void>;
  /** Optional "send test email" slot (rendered under the main form). */
  testSlot?: React.ReactNode;
  /** Extra content under the save button. */
  footerSlot?: React.ReactNode;
}

export function EmailConfigForm({
  scope,
  initial,
  saving = false,
  loading = false,
  platformSender,
  onSave,
  testSlot,
  footerSlot,
}: EmailConfigFormProps) {
  const [values, setValues] = useState<EmailConfigValues>(EMPTY);
  const [provider, setProvider] = useState<EmailProvider>(
    scope === "org" ? "platform" : "smtp",
  );

  // Sync state from props whenever `initial` changes identity.
  useEffect(() => {
    const next: EmailConfigValues = {
      smtpHost: initial?.smtpHost ?? "",
      smtpPort: initial?.smtpPort != null ? String(initial.smtpPort) : "587",
      smtpUser: initial?.smtpUser ?? "",
      smtpPass: initial?.smtpPass ?? "",
      smtpSecure: initial?.smtpSecure ?? true,
      fromAddress: initial?.fromAddress ?? "",
      fromName: initial?.fromName ?? "",
    };
    setValues(next);
    setProvider(deriveProvider(next, scope));
  }, [initial, scope]);

  /**
   * When the user flips providers, rewrite the SMTP-specific fields in
   * place so they don't see stale values from the other mode. The secret
   * (smtpPass) is kept — switching from Resend to SMTP should keep the key
   * as the new password if the admin wants to reuse it. "platform" wipes
   * the transport fields entirely so the row is stored empty and the
   * backend falls back to the system-org config.
   */
  const switchProvider = useCallback((next: EmailProvider) => {
    setProvider(next);
    if (next === "platform") {
      setValues((v) => ({
        ...v,
        smtpHost: "",
        smtpPort: "587",
        smtpUser: "",
        smtpPass: "",
        smtpSecure: true,
        fromAddress: "",
        fromName: "",
      }));
    } else if (next === "resend") {
      setValues((v) => ({
        ...v,
        smtpHost: RESEND_HOST,
        smtpPort: RESEND_PORT,
        smtpUser: RESEND_USER,
        smtpSecure: true,
      }));
    } else {
      // Clear Resend-locked fields so the admin types real values.
      setValues((v) => ({
        ...v,
        smtpHost: v.smtpHost === RESEND_HOST ? "" : v.smtpHost,
        smtpUser: v.smtpUser === RESEND_USER ? "" : v.smtpUser,
      }));
    }
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    // Normalize payload per provider:
    //  - resend: pin host/port/user/secure so the row persists in the exact
    //    shape the backend expects, even if the admin didn't touch anything.
    //  - platform: wipe all transport + from fields so the backend falls back
    //    to the system-org config. The invite subject/template are preserved
    //    because the org may still want to personalize them.
    const payload: EmailConfigValues =
      provider === "resend"
        ? {
            ...values,
            smtpHost: RESEND_HOST,
            smtpPort: RESEND_PORT,
            smtpUser: RESEND_USER,
            smtpSecure: true,
          }
        : provider === "platform"
        ? {
            ...values,
            smtpHost: "",
            smtpPort: "",
            smtpUser: "",
            smtpPass: "",
            smtpSecure: true,
            fromAddress: "",
            fromName: "",
          }
        : values;
    await onSave(payload);
  }

  if (loading) {
    return <p className="text-gray-500 text-sm py-8 text-center">Cargando...</p>;
  }

  const platformFromAddress = platformSender?.fromAddress?.trim() || null;
  const platformFromName = platformSender?.fromName?.trim() || null;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Provider picker — always visible. */}
      <div className="border rounded-lg p-4 space-y-3">
        <h3 className="font-semibold text-sm text-gray-700 uppercase tracking-wider">Proveedor</h3>
        <div className="flex flex-wrap gap-4">
          {scope === "org" && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="email-provider"
                value="platform"
                checked={provider === "platform"}
                onChange={() => switchProvider("platform")}
              />
              Proveedor global MyCoLegal.app
            </label>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="email-provider"
              value="resend"
              checked={provider === "resend"}
              onChange={() => switchProvider("resend")}
            />
            Resend
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="email-provider"
              value="smtp"
              checked={provider === "smtp"}
              onChange={() => switchProvider("smtp")}
            />
            SMTP
          </label>
        </div>
        <p className="text-xs text-gray-500">
          {provider === "platform"
            ? "Los correos de esta organización se enviarán desde la cuenta genérica de la plataforma MyCoLegal.app."
            : provider === "resend"
            ? "Envíos vía Resend. Sólo necesitas la API key y la dirección de remitente."
            : scope === "platform"
            ? "Servidor SMTP arbitrario. Si todos los campos quedan vacíos se usarán las variables de entorno del servicio."
            : "Servidor SMTP propio de esta organización."}
        </p>
      </div>

      {/* Provider-specific section */}
      {provider === "platform" ? (
        <div className="border rounded-lg p-4 bg-blue-50/40 text-sm text-gray-700 space-y-2">
          <p>
            Los correos se enviarán desde la cuenta genérica configurada en el servicio global de correo de la plataforma:
          </p>
          {platformFromAddress ? (
            <p className="font-mono text-xs bg-white border border-gray-200 rounded px-2 py-1 inline-block">
              {platformFromName ? `${platformFromName} <${platformFromAddress}>` : platformFromAddress}
            </p>
          ) : (
            <p className="text-xs text-amber-700">
              Aún no se ha definido un remitente global. Un superadmin debe configurarlo en «Correo plataforma».
            </p>
          )}
          <p className="text-xs text-gray-500">
            No hace falta parametrizar SMTP ni Resend para esta organización. Las plantillas de correo se gestionan en el apartado «Plantillas de correo» dentro de la administración de cada aplicación.
          </p>
        </div>
      ) : (
        <div className="border rounded-lg p-4 space-y-4">
          {provider === "resend" ? (
            <ResendFields values={values} setValues={setValues} scope={scope} />
          ) : (
            <SmtpFields values={values} setValues={setValues} scope={scope} />
          )}
        </div>
      )}

      {testSlot}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-cyan px-6 py-2 text-sm font-medium text-white hover:bg-cyan/90 disabled:opacity-50"
        >
          {saving
            ? "Guardando..."
            : scope === "platform"
            ? "Guardar configuración por defecto"
            : "Guardar configuración de email"}
        </button>
      </div>

      {footerSlot}
    </form>
  );
}

function ResendFields({
  values,
  setValues,
  scope,
}: {
  values: EmailConfigValues;
  setValues: (u: (v: EmailConfigValues) => EmailConfigValues) => void;
  scope: "platform" | "org";
}) {
  return (
    <>
      <h3 className="font-semibold text-sm text-gray-700 uppercase tracking-wider">
        Credenciales Resend
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">API Key</label>
          <input
            type="password"
            value={values.smtpPass}
            onChange={(e) => setValues((v) => ({ ...v, smtpPass: e.target.value }))}
            placeholder="re_..."
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono"
            autoComplete="new-password"
          />
          <p className="text-xs text-gray-400 mt-1">
            Se guarda como contraseña SMTP. Host/puerto/usuario se fijan automáticamente
            (<code className="text-[10px] bg-gray-100 rounded px-1">smtp.resend.com:465 / resend</code>).
          </p>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Remitente (email)</label>
          <input
            type="email"
            value={values.fromAddress}
            onChange={(e) => setValues((v) => ({ ...v, fromAddress: e.target.value }))}
            placeholder={scope === "platform" ? "no-reply@mail.mycolegal.app" : "noreply@midominio.com"}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Nombre remitente</label>
          <input
            type="text"
            value={values.fromName}
            onChange={(e) => setValues((v) => ({ ...v, fromName: e.target.value }))}
            placeholder="mycolegal.app"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
      </div>
    </>
  );
}

function SmtpFields({
  values,
  setValues,
  scope,
}: {
  values: EmailConfigValues;
  setValues: (u: (v: EmailConfigValues) => EmailConfigValues) => void;
  scope: "platform" | "org";
}) {
  return (
    <>
      <h3 className="font-semibold text-sm text-gray-700 uppercase tracking-wider">
        Servidor SMTP{scope === "platform" ? " por defecto" : ""}
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Host</label>
          <input
            type="text"
            value={values.smtpHost}
            onChange={(e) => setValues((v) => ({ ...v, smtpHost: e.target.value }))}
            placeholder={scope === "platform" ? "smtp.mycolegal.app" : "smtp.ejemplo.com"}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Puerto</label>
          <input
            type="text"
            value={values.smtpPort}
            onChange={(e) => setValues((v) => ({ ...v, smtpPort: e.target.value }))}
            placeholder="587"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Usuario</label>
          <input
            type="text"
            value={values.smtpUser}
            onChange={(e) => setValues((v) => ({ ...v, smtpUser: e.target.value }))}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Contraseña</label>
          <input
            type="password"
            value={values.smtpPass}
            onChange={(e) => setValues((v) => ({ ...v, smtpPass: e.target.value }))}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            autoComplete="new-password"
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Remitente (email)</label>
          <input
            type="email"
            value={values.fromAddress}
            onChange={(e) => setValues((v) => ({ ...v, fromAddress: e.target.value }))}
            placeholder={scope === "platform" ? "noreply@mycolegal.app" : "noreply@midominio.com"}
            className="w-full sm:w-64 rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Nombre remitente</label>
          <input
            type="text"
            value={values.fromName}
            onChange={(e) => setValues((v) => ({ ...v, fromName: e.target.value }))}
            placeholder="mycolegal.app"
            className="w-full sm:w-64 rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <label className="flex items-center gap-2 text-sm mt-4">
          <input
            type="checkbox"
            checked={values.smtpSecure}
            onChange={(e) => setValues((v) => ({ ...v, smtpSecure: e.target.checked }))}
            className="rounded border-gray-300"
          />
          TLS/SSL
        </label>
      </div>
    </>
  );
}
