"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Heading1,
  Heading2,
  List,
  ListOrdered,
  Link as LinkIcon,
  Undo2,
  Redo2,
  ExternalLink,
  Eye,
} from "lucide-react";

import { useI18n } from "../i18n/i18n-context";

/**
 * Shape returned by /api/admin/document-templates.
 * Paralelo a EmailTemplateEntry pero para plantillas PDF:
 *   - Solo cuerpo (no hay subject — los PDFs no tienen asunto).
 *   - Macros con metadatos enriquecidos (`label`, `example`).
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
  endpoint?: string;
  emptyMessage?: string;
  onToast?: (message: string, kind: "success" | "error") => void;
}

// ---------------------------------------------------------------------------
// HTML splitting — separa el wrapper de impresión (<doctype>, <head><style>,
// <html>, <body>) del contenido editable visualmente. El editor visual TipTap
// solo conoce el contenido entre <body>...</body>; el resto se preserva
// íntegro al recomponer el HTML para guardar/preview.
// ---------------------------------------------------------------------------

interface HtmlParts {
  /** Texto bruto entre <head>...</head> (incluye <style>, <meta>, etc.). */
  head: string;
  /** Atributos del <body> ("class=..." o ""). */
  bodyAttrs: string;
  /** Contenido entre <body>...</body> — esto es lo que ve el editor visual. */
  bodyContent: string;
  /** Si el HTML original NO tenía wrapper completo, no recomponemos al guardar. */
  hasWrapper: boolean;
  /** Atributo lang del <html> si existía (`<html lang="es">`). */
  htmlLang: string | null;
}

function splitHtml(fullHtml: string): HtmlParts {
  const headMatch = fullHtml.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  const bodyMatch = fullHtml.match(/<body([^>]*)>([\s\S]*)<\/body>/i);
  const langMatch = fullHtml.match(/<html[^>]*\blang="([^"]*)"[^>]*>/i);
  if (!bodyMatch) {
    return {
      head: "",
      bodyAttrs: "",
      bodyContent: fullHtml,
      hasWrapper: false,
      htmlLang: null,
    };
  }
  return {
    head: headMatch ? headMatch[1].trim() : "",
    bodyAttrs: bodyMatch[1].trim(),
    bodyContent: bodyMatch[2].trim(),
    hasWrapper: true,
    htmlLang: langMatch ? langMatch[1] : null,
  };
}

function joinHtml(parts: HtmlParts, newBodyContent: string): string {
  if (!parts.hasWrapper) return newBodyContent;
  const langAttr = parts.htmlLang ? ` lang="${parts.htmlLang}"` : "";
  const bodyOpen = parts.bodyAttrs ? `<body ${parts.bodyAttrs}>` : "<body>";
  return `<!doctype html>
<html${langAttr}>
<head>
${parts.head}
</head>
${bodyOpen}
${newBodyContent}
</body>
</html>`;
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
  const [view, setView] = useState<"visual" | "html">("visual");
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Partes del HTML completo. En modo visual el editor TipTap edita
  // `parts.bodyContent` y el resto (head con <style>, doctype, attrs del
  // body, lang) se preserva al recomponer.
  const parts = useMemo(() => splitHtml(bodyHtml), [bodyHtml]);

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

  useEffect(() => {
    if (!selected) {
      setBodyHtml("");
      return;
    }
    setBodyHtml(selected.body ?? selected.defaultBody);
  }, [selected]);

  useEffect(() => {
    setPreviewBlobUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }, [selectedKey]);

  useEffect(() => {
    return () => {
      if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // TipTap edita SOLO el contenido del body. Al cambiar el editor, recomponemos
  // el HTML completo con el head/wrapper original.
  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: "noopener" } }),
    ],
    content: parts.bodyContent,
    editorProps: {
      attributes: {
        class:
          "prose prose-sm max-w-none min-h-[260px] focus:outline-none px-3 py-2 leading-relaxed",
      },
    },
    onUpdate: ({ editor }) => {
      const newBody = editor.getHTML();
      setBodyHtml(joinHtml(parts, newBody));
    },
    immediatelyRender: false,
  });

  // Sincronizar el contenido del editor visual cuando cambia la plantilla
  // seleccionada o cuando el usuario vuelve del modo HTML al visual.
  useEffect(() => {
    if (!editor) return;
    if (view !== "visual") return;
    if (editor.getHTML() === parts.bodyContent) return;
    editor.commands.setContent(parts.bodyContent || "<p></p>", false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, parts.bodyContent, view, selectedKey]);

  function insertMacro(name: string) {
    const token = `{{${name}}}`;
    if (view === "visual" && editor) {
      editor.chain().focus().insertContent(token).run();
      return;
    }
    // Modo HTML: insertar en la posición del cursor del textarea.
    const ta = textareaRef.current;
    if (!ta) {
      setBodyHtml((prev) => `${prev}${token}`);
      return;
    }
    const start = ta.selectionStart ?? bodyHtml.length;
    const end = ta.selectionEnd ?? bodyHtml.length;
    const next = bodyHtml.slice(0, start) + token + bodyHtml.slice(end);
    setBodyHtml(next);
    requestAnimationFrame(() => {
      if (!textareaRef.current) return;
      const pos = start + token.length;
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(pos, pos);
    });
  }

  function applyLink() {
    if (!editor) return;
    const previous = editor.getAttributes("link").href ?? "";
    const url = window.prompt(t("ui.documentTemplates.linkPrompt"), previous);
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
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
      // Rev 2026-05-30: abre directamente en pestaña nueva en lugar de
      // embeber en iframe. El iframe + blob URL queda bloqueado por
      // CSP/sandbox en algunos navegadores ("This content is blocked").
      // Abrir el blob en una ventana propia evita el problema y es lo que
      // espera el usuario al pulsar "Vista previa".
      setPreviewBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
      // El blob URL se revoca cuando el componente cambia de plantilla o se
      // desmonta; window.open lo conserva mientras la pestaña esté abierta.
      window.open(url, "_blank", "noopener,noreferrer");
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

          {/* Body — toolbar + editor visual / HTML crudo */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-gray-600">
                {t("ui.documentTemplates.bodyLabel")}
              </label>
              <div className="flex gap-1 rounded border border-gray-200 bg-gray-50 p-0.5 text-[10px]">
                <button
                  type="button"
                  onClick={() => setView("visual")}
                  className={`px-2 py-0.5 rounded ${
                    view === "visual"
                      ? "bg-white shadow-sm text-gray-900"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {t("ui.documentTemplates.viewVisual")}
                </button>
                <button
                  type="button"
                  onClick={() => setView("html")}
                  className={`px-2 py-0.5 rounded ${
                    view === "html"
                      ? "bg-white shadow-sm text-gray-900"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {t("ui.documentTemplates.viewHtml")}
                </button>
              </div>
            </div>

            {view === "visual" ? (
              <div className="rounded border border-gray-300 overflow-hidden">
                <Toolbar editor={editor} onLink={applyLink} t={t} />
                <EditorContent editor={editor} />
                {parts.hasWrapper && (
                  <p className="bg-amber-50 border-t border-amber-200 px-2 py-1 text-[10px] text-amber-800">
                    {t("ui.documentTemplates.visualHint")}
                  </p>
                )}
              </div>
            ) : (
              <textarea
                ref={textareaRef}
                value={bodyHtml}
                onChange={(ev) => setBodyHtml(ev.target.value)}
                rows={20}
                spellCheck={false}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs font-mono leading-relaxed"
              />
            )}
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

          {/* Vista previa: se abre en pestaña nueva (rev 2026-05-30); se
              mantiene un enlace "Reabrir" por si la pestaña se cerró. */}
          {previewBlobUrl && (
            <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600 flex items-center justify-between">
              <span>{t("ui.documentTemplates.previewOpenedHint")}</span>
              <a
                href={previewBlobUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-gray-700 hover:text-gray-900 underline"
              >
                <ExternalLink className="h-3 w-3" />
                {t("ui.documentTemplates.openInNewTab")}
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TipTap toolbar — clon ligero del de email-templates-manager. No incluye el
// botón de logo (los logos de los PDFs van en el `<head><style>` del wrapper
// y se editan desde el modo HTML).
// ---------------------------------------------------------------------------

interface ToolbarProps {
  editor: Editor | null;
  onLink: () => void;
  t: (key: string) => string;
}

function Toolbar({ editor, onLink, t }: ToolbarProps) {
  if (!editor) {
    return <div className="h-9 border-b border-gray-200 bg-gray-50" />;
  }
  const btnBase =
    "h-7 w-7 inline-flex items-center justify-center rounded text-gray-600 hover:bg-gray-100 disabled:opacity-40";
  const btnActive = "bg-gray-200 text-gray-900";

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-gray-200 bg-gray-50 px-1.5 py-1">
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBold().run()}
        title={t("ui.documentTemplates.btnBold")}
        className={`${btnBase} ${editor.isActive("bold") ? btnActive : ""}`}
      >
        <Bold className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleItalic().run()}
        title={t("ui.documentTemplates.btnItalic")}
        className={`${btnBase} ${editor.isActive("italic") ? btnActive : ""}`}
      >
        <Italic className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleStrike().run()}
        title={t("ui.documentTemplates.btnUnderline")}
        className={`${btnBase} ${editor.isActive("strike") ? btnActive : ""}`}
      >
        <UnderlineIcon className="h-3.5 w-3.5" />
      </button>
      <span className="mx-1 h-4 w-px bg-gray-300" />
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        title={t("ui.documentTemplates.btnH1")}
        className={`${btnBase} ${editor.isActive("heading", { level: 1 }) ? btnActive : ""}`}
      >
        <Heading1 className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        title={t("ui.documentTemplates.btnH2")}
        className={`${btnBase} ${editor.isActive("heading", { level: 2 }) ? btnActive : ""}`}
      >
        <Heading2 className="h-3.5 w-3.5" />
      </button>
      <span className="mx-1 h-4 w-px bg-gray-300" />
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        title={t("ui.documentTemplates.btnBulletList")}
        className={`${btnBase} ${editor.isActive("bulletList") ? btnActive : ""}`}
      >
        <List className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        title={t("ui.documentTemplates.btnOrderedList")}
        className={`${btnBase} ${editor.isActive("orderedList") ? btnActive : ""}`}
      >
        <ListOrdered className="h-3.5 w-3.5" />
      </button>
      <span className="mx-1 h-4 w-px bg-gray-300" />
      <button
        type="button"
        onClick={onLink}
        title={t("ui.documentTemplates.btnLink")}
        className={`${btnBase} ${editor.isActive("link") ? btnActive : ""}`}
      >
        <LinkIcon className="h-3.5 w-3.5" />
      </button>
      <span className="mx-1 h-4 w-px bg-gray-300" />
      <button
        type="button"
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
        title={t("ui.documentTemplates.btnUndo")}
        className={btnBase}
      >
        <Undo2 className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
        title={t("ui.documentTemplates.btnRedo")}
        className={btnBase}
      >
        <Redo2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
