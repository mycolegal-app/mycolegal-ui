"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Shape returned by /api/admin/email-templates (each consuming app
 * exposes this path, which proxies auth's
 * /orgs/:id/email-templates?appSlug=<slug>).
 */
export interface EmailTemplateEntry {
  eventKey: string;
  label: string;
  description: string | null;
  macros: string[];
  defaultSubject: string;
  defaultBody: string;
  /** `null` = the org uses the default; anything else is the override. */
  subject: string | null;
  body: string | null;
}

export interface EmailTemplatesManagerProps {
  /** Base URL where the app exposes the templates proxy (default `/api/admin/email-templates`). */
  endpoint?: string;
  /** Render a callout when the list is empty. */
  emptyMessage?: string;
  /** Notifier for success/error toasts. */
  onToast?: (message: string, kind: "success" | "error") => void;
}

export function EmailTemplatesManager({
  endpoint = "/api/admin/email-templates",
  emptyMessage = "Esta aplicación no declara eventos de correo.",
  onToast,
}: EmailTemplatesManagerProps) {
  const [templates, setTemplates] = useState<EmailTemplateEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [edits, setEdits] = useState<
    Record<string, { subject: string; body: string }>
  >({});
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(endpoint);
      if (res.ok) {
        const json = await res.json();
        const rows: EmailTemplateEntry[] = json.data ?? [];
        setTemplates(rows);
        // Hydrate edits buffer with whatever the org currently has stored
        // (or the default, if no override exists) so the textarea shows
        // something editable from the start.
        const initial: Record<string, { subject: string; body: string }> = {};
        for (const t of rows) {
          initial[t.eventKey] = {
            subject: t.subject ?? t.defaultSubject,
            body: t.body ?? t.defaultBody,
          };
        }
        setEdits(initial);
      }
    } catch (err) {
      console.error("Error fetching email templates:", err);
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => {
    void load();
  }, [load]);

  const isOverridden = (t: EmailTemplateEntry) => t.subject !== null || t.body !== null;

  async function handleSave(t: EmailTemplateEntry) {
    setSavingKey(t.eventKey);
    try {
      const e = edits[t.eventKey];
      const subject = e.subject === t.defaultSubject ? null : e.subject;
      const body = e.body === t.defaultBody ? null : e.body;
      const res = await fetch(`${endpoint}/${encodeURIComponent(t.eventKey)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, body }),
      });
      if (res.ok) {
        onToast?.("Plantilla guardada", "success");
        await load();
      } else {
        onToast?.("Error al guardar la plantilla", "error");
      }
    } catch {
      onToast?.("Error al guardar la plantilla", "error");
    } finally {
      setSavingKey(null);
    }
  }

  async function handleReset(t: EmailTemplateEntry) {
    setSavingKey(t.eventKey);
    try {
      const res = await fetch(`${endpoint}/${encodeURIComponent(t.eventKey)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: null, body: null }),
      });
      if (res.ok) {
        onToast?.("Plantilla restablecida a la plantilla por defecto", "success");
        await load();
      } else {
        onToast?.("Error al restablecer la plantilla", "error");
      }
    } catch {
      onToast?.("Error al restablecer la plantilla", "error");
    } finally {
      setSavingKey(null);
    }
  }

  if (loading) return <p className="text-sm text-gray-500 py-6 text-center">Cargando plantillas...</p>;

  if (templates.length === 0) {
    return <p className="text-sm text-gray-500 py-6 text-center">{emptyMessage}</p>;
  }

  return (
    <div className="space-y-6">
      {templates.map((t) => {
        const e = edits[t.eventKey] ?? { subject: "", body: "" };
        const overridden = isOverridden(t);
        return (
          <div key={t.eventKey} className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-semibold text-sm text-gray-800">{t.label}</h4>
                  <code className="text-[10px] bg-gray-100 rounded px-1 py-0.5 text-gray-600 font-mono">
                    {t.eventKey}
                  </code>
                  {overridden ? (
                    <span className="text-[10px] uppercase tracking-wide text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5">
                      Personalizada
                    </span>
                  ) : (
                    <span className="text-[10px] uppercase tracking-wide text-gray-500 bg-gray-50 border border-gray-200 rounded px-1.5 py-0.5">
                      Por defecto
                    </span>
                  )}
                </div>
                {t.description && <p className="mt-1 text-xs text-gray-500">{t.description}</p>}
              </div>
              {overridden && (
                <button
                  type="button"
                  onClick={() => handleReset(t)}
                  disabled={savingKey === t.eventKey}
                  className="text-xs text-gray-500 hover:text-gray-700 underline disabled:opacity-50"
                >
                  Usar plantilla por defecto
                </button>
              )}
            </div>

            {t.macros.length > 0 && (
              <div className="bg-gray-50 rounded p-2">
                <p className="text-[10px] font-medium text-gray-500 mb-1">Macros disponibles:</p>
                <div className="flex flex-wrap gap-1">
                  {t.macros.map((m) => (
                    <code
                      key={m}
                      className="text-[10px] bg-white border border-gray-200 rounded px-1 py-0.5 text-gray-700 font-mono"
                    >{`{{${m}}}`}</code>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Asunto</label>
              <input
                type="text"
                value={e.subject}
                onChange={(ev) => setEdits((prev) => ({ ...prev, [t.eventKey]: { ...e, subject: ev.target.value } }))}
                placeholder={t.defaultSubject}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Cuerpo (HTML)</label>
              <textarea
                value={e.body}
                onChange={(ev) => setEdits((prev) => ({ ...prev, [t.eventKey]: { ...e, body: ev.target.value } }))}
                placeholder={t.defaultBody}
                rows={10}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm font-mono"
              />
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => handleSave(t)}
                disabled={savingKey === t.eventKey}
                className="rounded bg-cyan px-4 py-1.5 text-xs font-medium text-white hover:bg-cyan/90 disabled:opacity-50"
              >
                {savingKey === t.eventKey ? "Guardando..." : "Guardar plantilla"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
