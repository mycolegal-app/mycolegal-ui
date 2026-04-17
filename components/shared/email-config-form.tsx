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
  inviteSubject: string;
  inviteTemplate: string;
}

export type EmailProvider = "resend" | "smtp";

const EMPTY: EmailConfigValues = {
  smtpHost: "",
  smtpPort: "587",
  smtpUser: "",
  smtpPass: "",
  smtpSecure: true,
  fromAddress: "",
  fromName: "",
  inviteSubject: "",
  inviteTemplate: "",
};

const RESEND_HOST = "smtp.resend.com";
const RESEND_PORT = "465";
const RESEND_USER = "resend";

/**
 * Heuristic: a row is "Resend-shaped" iff it has Resend's host and the
 * canonical `resend` SMTP user. Anything else is treated as plain SMTP.
 * Option A in the proposal — no schema/provider column.
 */
export function deriveProvider(cfg: Partial<EmailConfigValues> | null | undefined): EmailProvider {
  if (!cfg) return "smtp";
  if (cfg.smtpHost === RESEND_HOST && (cfg.smtpUser ?? "") === RESEND_USER) return "resend";
  return "smtp";
}

export interface EmailConfigFormProps {
  /** "platform" (system-org default) vs "org" (per-org override). Affects copy + placeholders. */
  scope: "platform" | "org";
  /** Initial config as returned by the API (nullable fields stringified). */
  initial?: Partial<EmailConfigValues> | null;
  /** Default invite subject/template from the i18n layer (shown as placeholders). */
  defaults?: { inviteSubject?: string; inviteTemplate?: string };
  /** Macros listed above the template editor. */
  macros?: string[];
  /** Labeled "Guardando…" while true. */
  saving?: boolean;
  /** Disable the whole form (loading state). */
  loading?: boolean;
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
  defaults,
  macros = [],
  saving = false,
  loading = false,
  onSave,
  testSlot,
  footerSlot,
}: EmailConfigFormProps) {
  const [values, setValues] = useState<EmailConfigValues>(EMPTY);
  const [provider, setProvider] = useState<EmailProvider>("smtp");

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
      inviteSubject: initial?.inviteSubject ?? "",
      inviteTemplate: initial?.inviteTemplate ?? "",
    };
    setValues(next);
    setProvider(deriveProvider(next));
  }, [initial]);

  /**
   * When the user flips providers, rewrite the SMTP-specific fields in
   * place so they don't see stale values from the other mode. The secret
   * (smtpPass) is kept — switching from Resend to SMTP should keep the key
   * as the new password if the admin wants to reuse it.
   */
  const switchProvider = useCallback((next: EmailProvider) => {
    setProvider(next);
    if (next === "resend") {
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
    // Normalize Resend payload so the row persists with the exact shape the
    // backend expects — admin might have changed nothing after switching
    // provider; we still want the host/user/secure pinned.
    const payload: EmailConfigValues =
      provider === "resend"
        ? {
            ...values,
            smtpHost: RESEND_HOST,
            smtpPort: RESEND_PORT,
            smtpUser: RESEND_USER,
            smtpSecure: true,
          }
        : values;
    await onSave(payload);
  }

  if (loading) {
    return <p className="text-gray-500 text-sm py-8 text-center">Cargando...</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Provider picker — always visible. */}
      <div className="border rounded-lg p-4 space-y-3">
        <h3 className="font-semibold text-sm text-gray-700 uppercase tracking-wider">Proveedor</h3>
        <div className="flex gap-4">
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
          {provider === "resend"
            ? "Envíos vía Resend. Sólo necesitas la API key y la dirección de remitente."
            : scope === "platform"
            ? "Servidor SMTP arbitrario. Si todos los campos quedan vacíos se usarán las variables de entorno del servicio."
            : "Servidor SMTP propio de esta organización. Si queda vacío, se usa la configuración genérica de la plataforma."}
        </p>
      </div>

      {/* Provider-specific fields */}
      <div className="border rounded-lg p-4 space-y-4">
        {provider === "resend" ? (
          <ResendFields values={values} setValues={setValues} scope={scope} />
        ) : (
          <SmtpFields values={values} setValues={setValues} scope={scope} />
        )}
      </div>

      {/* Invitation template — identical for both providers */}
      <div className="border rounded-lg p-4 space-y-4">
        <h3 className="font-semibold text-sm text-gray-700 uppercase tracking-wider">
          Plantilla de invitación{scope === "platform" ? " por defecto" : ""}
        </h3>

        {macros.length > 0 && (
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs font-medium text-gray-500 mb-2">Macros disponibles:</p>
            <div className="flex flex-wrap gap-1.5">
              {macros.map((m) => (
                <code
                  key={m}
                  className="text-xs bg-white border border-gray-200 rounded px-1.5 py-0.5 text-gray-700 font-mono"
                >{`{{${m}}}`}</code>
              ))}
            </div>
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Asunto</label>
          <input
            type="text"
            value={values.inviteSubject}
            onChange={(e) => setValues((v) => ({ ...v, inviteSubject: e.target.value }))}
            placeholder={defaults?.inviteSubject}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <p className="text-xs text-gray-400 mt-1">Vacío = plantilla por defecto del código (i18n)</p>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Cuerpo (HTML)</label>
          <textarea
            value={values.inviteTemplate}
            onChange={(e) => setValues((v) => ({ ...v, inviteTemplate: e.target.value }))}
            placeholder={defaults?.inviteTemplate}
            rows={12}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono"
          />
          <p className="text-xs text-gray-400 mt-1">
            Vacío = plantilla por defecto del código (i18n). Usa las macros indicadas arriba.
          </p>
        </div>

        {defaults?.inviteTemplate && !values.inviteTemplate && (
          <details className="text-sm">
            <summary className="cursor-pointer text-gray-500 hover:text-gray-700">
              Ver plantilla por defecto del código
            </summary>
            <pre className="mt-2 bg-gray-50 rounded-lg p-3 text-xs overflow-x-auto whitespace-pre-wrap font-mono text-gray-600">
              {defaults.inviteTemplate}
            </pre>
          </details>
        )}
      </div>

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
