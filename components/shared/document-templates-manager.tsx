"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, Eye } from "lucide-react";

import { useI18n } from "../i18n/i18n-context";

/**
 * Shape returned by /api/admin/document-templates. Each consuming app exposes
 * this endpoint, which merges the document template catalog with the
 * per-organisation overrides stored locally (DocumentoPlantilla).
 *
 * Paralelo a EmailTemplateEntry pero para plantillas PDF:
 *   - Solo cuerpo (no hay subject — los PDFs no tienen asunto).
 *   - Macros con metadatos enriquecidos (`label`, `example`) para poder mostrar
 *     una etiqueta legible al usuario y para que el preview pueda sustituir
 *     valores realistas en lugar de los identificadores crudos.
 */
export interface DocumentTemplateMacro {
  key: string;
  label: string;
  example: string;
}

export interface DocumentTemplateEntry {
  eventKey: string;
  label: string;
  description: string | null;
  macros: DocumentTemplateMacro[];
  defaultBody: string;
  /** `null` = the org uses the default; anything else is the override. */
  body: string | null;
  active: boolean;
  updatedAt: string | null;
}

export interface DocumentTemplatesManagerProps {
  /** Base URL where the app exposes the templates endpoint. */
  endpoint?: string;
  /** Render a callout when the list is empty. */
  emptyMessage?: string;
  /** Notifier for success/error toasts. */
  onToast?: (message: string, kind: "success" | "error") => void;
}

export function DocumentTemplatesManager({
  endpoint = "/api/admin/document-templates",
  emptyMessage,
  onToast,
}: DocumentTemplatesManagerProps) {
  const { t } = useI18n();
  const resolvedEmptyMessage = emptyMessage ?? t("ui.documentTemplates.emptyDefault");
  const [templates, setTemplates] = useState<DocumentTemplateEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [bodyHtml, setBodyHtml] = useState("");
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(endpoint);
      if (res.ok) {
        const json = await res.json();
        const rows: DocumentTemplateEntry[] = json.data ?? [];
        setTemplates(rows);
        if (rows.length > 0) {
          setSelectedKey((prev) => prev ?? rows[0].eventKey);
        }
      }
    } catch (err) {
      console.error("Error fetching document templates:", err);
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = useMemo(
    () => templates.find((tpl) => tpl.eventKey === selectedKey) ?? null,
    [templates, selectedKey],
  );

  // Hydrate the editable body whenever the selected template changes or the
  // list refreshes after a save.
  useEffect(() => {
    if (!selected) {
      setBodyHtml("");
      return;
    }
    setBodyHtml(selected.body ?? selected.defaultBody);
  }, [selected]);

  // Clear any cached preview when the user switches templates — the PDF would
  // belong to the previous template and showing it would be confusing.
  useEffect(() => {
    setPreviewBlobUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }, [selectedKey]);

  // Final cleanup on unmount: release the last blob URL so the browser can
  // reclaim its memory.
  useEffect(() => {
    return () => {
      if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl);
    };
    // We intentionally depend only on the latest value at unmount time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function insertMacro(name: string) {
    const token = `{{${name}}}`;
    const ta = textareaRef.current;
    if (!ta) {
      setBodyHtml((prev) => `${prev}${token}`);
      return;
    }
    const start = ta.selectionStart ?? bodyHtml.length;
    const end = ta.selectionEnd ?? bodyHtml.length;
    const next = bodyHtml.slice(0, start) + token + bodyHtml.slice(end);
    setBodyHtml(next);
    // Restore the cursor right after the inserted macro on the next tick so
    // React has time to flush the new value.
    requestAnimationFrame(() => {
      if (!textareaRef.current) return;
      const pos = start + token.length;
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(pos, pos);
    });
  }

  async function handlePreview() {
    if (!selected) return;
    setPreviewLoading(true);
    try {
      const res = await fetch(`${endpoint}/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventKey: selected.eventKey, bodyHtml }),
      });
      if (!res.ok) {
        onToast?.(t("ui.documentTemplates.errPreview"), "error");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setPreviewBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
    } catch {
      onToast?.(t("ui.documentTemplates.errPreview"), "error");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleSave() {
    if (!selected) return;
    setSavingKey(selected.eventKey);
    try {
      const res = await fetch(`${endpoint}/${encodeURIComponent(selected.eventKey)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bodyHtml }),
      });
      if (res.ok) {
        onToast?.(t("ui.documentTemplates.saved"), "success");
        await load();
      } else {
        onToast?.(t("ui.documentTemplates.errSave"), "error");
      }
    } catch {
      onToast?.(t("ui.documentTemplates.errSave"), "error");
    } finally {
      setSavingKey(null);
    }
  }

  async function handleReset() {
    if (!selected) return;
    setSavingKey(selected.eventKey);
    try {
      const res = await fetch(`${endpoint}/${encodeURIComponent(selected.eventKey)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        onToast?.(t("ui.documentTemplates.reset"), "success");
        await load();
      } else {
        onToast?.(t("ui.documentTemplates.errReset"), "error");
      }
    } catch {
      onToast?.(t("ui.documentTemplates.errReset"), "error");
    } finally {
      setSavingKey(null);
    }
  }

  function handleCancel() {
    if (!selected) return;
    setBodyHtml(selected.body ?? selected.defaultBody);
  }

  const isOverridden = (tpl: DocumentTemplateEntry) => tpl.body !== null;

  if (loading) {
    return (
      <p className="text-sm text-gray-500 py-6 text-center">
        {t("ui.documentTemplates.loadingTemplates")}
      </p>
    );
  }

  if (templates.length === 0) {
    return <p className="text-sm text-gray-500 py-6 text-center">{resolvedEmptyMessage}</p>;
  }

  const isDirty = selected ? bodyHtml !== (selected.body ?? selected.defaultBody) : false;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-4">
      {/* Selector — list of templates */}
      <aside className="space-y-1">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-2">
          {t("ui.documentTemplates.selectorHeader")}
        </p>
        {templates.map((tpl) => {
          const active = tpl.eventKey === selectedKey;
          return (
            <button
              key={tpl.eventKey}
              type="button"
              onClick={() => setSelectedKey(tpl.eventKey)}
              className={`w-full text-left rounded-md border px-3 py-2 transition-colors ${
                active
                  ? "border-cyan bg-cyan/5 text-gray-900"
                  : "border-gray-200 bg-white hover:bg-gray-50 text-gray-700"
              }`}
            >
              <div className="text-sm font-medium leading-tight">{tpl.label}</div>
              <div className="mt-0.5 text-[10px] text-gray-500 font-mono truncate">
                {tpl.eventKey}
              </div>
              <div className="mt-1">
                {isOverridden(tpl) ? (
                  <span className="text-[10px] uppercase tracking-wide text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5">
                    {t("ui.documentTemplates.badgeCustom")}
                  </span>
                ) : (
                  <span className="text-[10px] uppercase tracking-wide text-gray-500 bg-gray-50 border border-gray-200 rounded px-1.5 py-0.5">
                    {t("ui.documentTemplates.badgeDefault")}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </aside>

      {/* Editor — selected template */}
      {selected && (
        <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h4 className="font-semibold text-sm text-gray-800">{selected.label}</h4>
              {selected.description && (
                <p className="mt-1 text-xs text-gray-500">{selected.description}</p>
              )}
              <p className="mt-1 text-[10px] text-gray-500">
                {isOverridden(selected)
                  ? t("ui.documentTemplates.usingOverride")
                  : t("ui.documentTemplates.usingDefault")}
              </p>
            </div>
            {isOverridden(selected) && (
              <button
                type="button"
                onClick={handleReset}
                disabled={savingKey === selected.eventKey}
                className="text-xs text-gray-500 hover:text-gray-700 underline disabled:opacity-50 whitespace-nowrap"
              >
                {t("ui.documentTemplates.resetBtn")}
              </button>
            )}
          </div>

          {/* Body — raw HTML editor (PDFs incluyen <style>, @page, etc. y no
              tiene sentido un WYSIWYG visual). */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              {t("ui.documentTemplates.bodyLabel")}
            </label>
            <textarea
              ref={textareaRef}
              value={bodyHtml}
              onChange={(ev) => setBodyHtml(ev.target.value)}
              rows={20}
              spellCheck={false}
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs font-mono leading-relaxed"
            />
          </div>

          {/* Macros */}
          {selected.macros.length > 0 && (
            <div className="bg-gray-50 rounded p-2">
              <p className="text-[10px] font-medium text-gray-500 mb-1.5">
                {t("ui.documentTemplates.macros")}
              </p>
              <div className="flex flex-wrap gap-1">
                {selected.macros.map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => insertMacro(m.key)}
                    title={`${m.label} — ${m.example}`}
                    className="text-[10px] bg-white border border-gray-200 rounded px-1.5 py-0.5 text-gray-700 font-mono hover:bg-cyan/10 hover:border-cyan transition-colors"
                  >{`{{${m.key}}}`}</button>
                ))}
              </div>
            </div>
          )}

          {/* Footer actions */}
          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={handleCancel}
              disabled={!isDirty || savingKey === selected.eventKey}
              className="rounded border border-gray-300 px-4 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {t("ui.documentTemplates.btnCancel")}
            </button>
            <button
              type="button"
              onClick={handlePreview}
              disabled={previewLoading || savingKey === selected.eventKey}
              className="inline-flex items-center gap-1.5 rounded border border-gray-300 px-4 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <Eye className="h-3.5 w-3.5" />
              {previewLoading
                ? t("ui.documentTemplates.previewLoading")
                : t("ui.documentTemplates.previewBtn")}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!isDirty || savingKey === selected.eventKey}
              className="rounded bg-cyan px-4 py-1.5 text-xs font-medium text-white hover:bg-cyan/90 disabled:opacity-50"
            >
              {savingKey === selected.eventKey
                ? t("ui.documentTemplates.saving")
                : t("ui.documentTemplates.saveBtn")}
            </button>
          </div>

          {/* Preview iframe */}
          {previewBlobUrl && (
            <div className="rounded border border-gray-200 overflow-hidden">
              <div className="flex items-center justify-between bg-gray-50 border-b border-gray-200 px-2 py-1">
                <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">
                  {t("ui.documentTemplates.previewTitle")}
                </span>
                <a
                  href={previewBlobUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[10px] text-gray-600 hover:text-gray-900 underline"
                >
                  <ExternalLink className="h-3 w-3" />
                  {t("ui.documentTemplates.openInNewTab")}
                </a>
              </div>
              <iframe
                src={previewBlobUrl}
                title={t("ui.documentTemplates.previewTitle")}
                className="w-full bg-white"
                style={{ height: 560 }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
