"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "../i18n/i18n-context";

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
  emptyMessage,
  onToast,
}: EmailTemplatesManagerProps) {
  const { t } = useI18n();
  const resolvedEmptyMessage = emptyMessage ?? t("ui.emailTemplates.emptyDefault");
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
        for (const tpl of rows) {
          initial[tpl.eventKey] = {
            subject: tpl.subject ?? tpl.defaultSubject,
            body: tpl.body ?? tpl.defaultBody,
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

  const isOverridden = (tpl: EmailTemplateEntry) => tpl.subject !== null || tpl.body !== null;

  async function handleSave(tpl: EmailTemplateEntry) {
    setSavingKey(tpl.eventKey);
    try {
      const e = edits[tpl.eventKey];
      const subject = e.subject === tpl.defaultSubject ? null : e.subject;
      const body = e.body === tpl.defaultBody ? null : e.body;
      const res = await fetch(`${endpoint}/${encodeURIComponent(tpl.eventKey)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, body }),
      });
      if (res.ok) {
        onToast?.(t("ui.emailTemplates.savedOk"), "success");
        await load();
      } else {
        onToast?.(t("ui.emailTemplates.errSave"), "error");
      }
    } catch {
      onToast?.(t("ui.emailTemplates.errSave"), "error");
    } finally {
      setSavingKey(null);
    }
  }

  async function handleReset(tpl: EmailTemplateEntry) {
    setSavingKey(tpl.eventKey);
    try {
      const res = await fetch(`${endpoint}/${encodeURIComponent(tpl.eventKey)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: null, body: null }),
      });
      if (res.ok) {
        onToast?.(t("ui.emailTemplates.resetOk"), "success");
        await load();
      } else {
        onToast?.(t("ui.emailTemplates.errReset"), "error");
      }
    } catch {
      onToast?.(t("ui.emailTemplates.errReset"), "error");
    } finally {
      setSavingKey(null);
    }
  }

  if (loading) return <p className="text-sm text-gray-500 py-6 text-center">{t("ui.emailTemplates.loadingTemplates")}</p>;

  if (templates.length === 0) {
    return <p className="text-sm text-gray-500 py-6 text-center">{resolvedEmptyMessage}</p>;
  }

  return (
    <div className="space-y-6">
      {templates.map((tpl) => {
        const e = edits[tpl.eventKey] ?? { subject: "", body: "" };
        const overridden = isOverridden(tpl);
        return (
          <div key={tpl.eventKey} className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-semibold text-sm text-gray-800">{tpl.label}</h4>
                  <code className="text-[10px] bg-gray-100 rounded px-1 py-0.5 text-gray-600 font-mono">
                    {tpl.eventKey}
                  </code>
                  {overridden ? (
                    <span className="text-[10px] uppercase tracking-wide text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5">
                      {t("ui.emailTemplates.badgeCustom")}
                    </span>
                  ) : (
                    <span className="text-[10px] uppercase tracking-wide text-gray-500 bg-gray-50 border border-gray-200 rounded px-1.5 py-0.5">
                      {t("ui.emailTemplates.badgeDefault")}
                    </span>
                  )}
                </div>
                {tpl.description && <p className="mt-1 text-xs text-gray-500">{tpl.description}</p>}
              </div>
              {overridden && (
                <button
                  type="button"
                  onClick={() => handleReset(tpl)}
                  disabled={savingKey === tpl.eventKey}
                  className="text-xs text-gray-500 hover:text-gray-700 underline disabled:opacity-50"
                >
                  {t("ui.emailTemplates.useDefault")}
                </button>
              )}
            </div>

            {tpl.macros.length > 0 && (
              <div className="bg-gray-50 rounded p-2">
                <p className="text-[10px] font-medium text-gray-500 mb-1">{t("ui.emailTemplates.macrosAvailable")}</p>
                <div className="flex flex-wrap gap-1">
                  {tpl.macros.map((m) => (
                    <code
                      key={m}
                      className="text-[10px] bg-white border border-gray-200 rounded px-1 py-0.5 text-gray-700 font-mono"
                    >{`{{${m}}}`}</code>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{t("ui.emailTemplates.subjectLabel")}</label>
              <input
                type="text"
                value={e.subject}
                onChange={(ev) => setEdits((prev) => ({ ...prev, [tpl.eventKey]: { ...e, subject: ev.target.value } }))}
                placeholder={tpl.defaultSubject}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{t("ui.emailTemplates.bodyLabel")}</label>
              <textarea
                value={e.body}
                onChange={(ev) => setEdits((prev) => ({ ...prev, [tpl.eventKey]: { ...e, body: ev.target.value } }))}
                placeholder={tpl.defaultBody}
                rows={10}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm font-mono"
              />
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => handleSave(tpl)}
                disabled={savingKey === tpl.eventKey}
                className="rounded bg-cyan px-4 py-1.5 text-xs font-medium text-white hover:bg-cyan/90 disabled:opacity-50"
              >
                {savingKey === tpl.eventKey ? t("ui.emailTemplates.saving") : t("ui.emailTemplates.btnSave")}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
