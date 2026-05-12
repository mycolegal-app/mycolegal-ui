"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  Image as ImageIcon,
} from "lucide-react";

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

const LOGO_SNIPPET =
  '<p style="text-align:center; margin:24px 0;"><img src="{{logoUrl}}" alt="{{orgName}}" style="max-width:200px; height:auto;" /></p>';

export function EmailTemplatesManager({
  endpoint = "/api/admin/email-templates",
  emptyMessage,
  onToast,
}: EmailTemplatesManagerProps) {
  const { t } = useI18n();
  const resolvedEmptyMessage = emptyMessage ?? t("ui.emailTemplates.emptyDefault");
  const [templates, setTemplates] = useState<EmailTemplateEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [view, setView] = useState<"visual" | "html">("visual");
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(endpoint);
      if (res.ok) {
        const json = await res.json();
        const rows: EmailTemplateEntry[] = json.data ?? [];
        setTemplates(rows);
        if (rows.length > 0) {
          setSelectedKey((prev) => prev ?? rows[0].eventKey);
        }
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

  const selected = useMemo(
    () => templates.find((tpl) => tpl.eventKey === selectedKey) ?? null,
    [templates, selectedKey],
  );

  // Hydrate the editable subject/body whenever the selected template changes
  // or the list refreshes after a save.
  useEffect(() => {
    if (!selected) {
      setSubject("");
      setBodyHtml("");
      return;
    }
    setSubject(selected.subject ?? selected.defaultSubject);
    setBodyHtml(selected.body ?? selected.defaultBody);
  }, [selected]);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: "noopener" } }),
    ],
    content: bodyHtml,
    editorProps: {
      attributes: {
        class:
          "prose prose-sm max-w-none min-h-[260px] focus:outline-none px-3 py-2 leading-relaxed",
      },
    },
    onUpdate: ({ editor }) => setBodyHtml(editor.getHTML()),
    immediatelyRender: false,
  });

  // Push external HTML into TipTap when the user switches templates or toggles
  // back from raw HTML mode. Skip when the editor itself emitted the change.
  useEffect(() => {
    if (!editor) return;
    if (view !== "visual") return;
    if (editor.getHTML() === bodyHtml) return;
    editor.commands.setContent(bodyHtml || "<p></p>", false);
  }, [editor, bodyHtml, view, selectedKey]);

  function insertMacro(name: string) {
    if (!editor) return;
    if (view === "html") {
      // Append at the end in raw mode — the user can move it if needed.
      setBodyHtml((prev) => `${prev}{{${name}}}`);
      return;
    }
    editor.chain().focus().insertContent(`{{${name}}}`).run();
  }

  function insertLogoSnippet() {
    if (view === "html") {
      setBodyHtml((prev) => `${prev}\n${LOGO_SNIPPET}`);
      return;
    }
    if (!editor) return;
    editor.chain().focus().insertContent(LOGO_SNIPPET).run();
  }

  function applyLink() {
    if (!editor) return;
    const previous = editor.getAttributes("link").href ?? "";
    const url = window.prompt(t("ui.emailTemplates.linkPrompt"), previous);
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }

  async function handleSave() {
    if (!selected) return;
    setSavingKey(selected.eventKey);
    try {
      const nextSubject = subject === selected.defaultSubject ? null : subject;
      const nextBody = bodyHtml === selected.defaultBody ? null : bodyHtml;
      const res = await fetch(`${endpoint}/${encodeURIComponent(selected.eventKey)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: nextSubject, body: nextBody }),
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

  async function handleReset() {
    if (!selected) return;
    setSavingKey(selected.eventKey);
    try {
      const res = await fetch(`${endpoint}/${encodeURIComponent(selected.eventKey)}`, {
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

  function handleCancel() {
    if (!selected) return;
    setSubject(selected.subject ?? selected.defaultSubject);
    setBodyHtml(selected.body ?? selected.defaultBody);
  }

  const isOverridden = (tpl: EmailTemplateEntry) =>
    tpl.subject !== null || tpl.body !== null;

  if (loading) {
    return (
      <p className="text-sm text-gray-500 py-6 text-center">
        {t("ui.emailTemplates.loadingTemplates")}
      </p>
    );
  }

  if (templates.length === 0) {
    return <p className="text-sm text-gray-500 py-6 text-center">{resolvedEmptyMessage}</p>;
  }

  const supportsLogo = selected?.macros.includes("logoUrl") ?? false;
  const isDirty = selected
    ? subject !== (selected.subject ?? selected.defaultSubject) ||
      bodyHtml !== (selected.body ?? selected.defaultBody)
    : false;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-4">
      {/* Selector — list of templates */}
      <aside className="space-y-1">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-2">
          {t("ui.emailTemplates.selectorHeader")}
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
                    {t("ui.emailTemplates.badgeCustom")}
                  </span>
                ) : (
                  <span className="text-[10px] uppercase tracking-wide text-gray-500 bg-gray-50 border border-gray-200 rounded px-1.5 py-0.5">
                    {t("ui.emailTemplates.badgeDefault")}
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
            </div>
            {isOverridden(selected) && (
              <button
                type="button"
                onClick={handleReset}
                disabled={savingKey === selected.eventKey}
                className="text-xs text-gray-500 hover:text-gray-700 underline disabled:opacity-50 whitespace-nowrap"
              >
                {t("ui.emailTemplates.useDefault")}
              </button>
            )}
          </div>

          {/* Subject */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              {t("ui.emailTemplates.subjectLabel")}
            </label>
            <input
              type="text"
              value={subject}
              onChange={(ev) => setSubject(ev.target.value)}
              placeholder={selected.defaultSubject}
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
            />
          </div>

          {/* Body — toolbar + editor / raw HTML */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-gray-600">
                {t("ui.emailTemplates.bodyLabel")}
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
                  {t("ui.emailTemplates.viewVisual")}
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
                  {t("ui.emailTemplates.viewHtml")}
                </button>
              </div>
            </div>

            {view === "visual" ? (
              <div className="rounded border border-gray-300 overflow-hidden">
                <Toolbar
                  editor={editor}
                  onLink={applyLink}
                  onLogo={supportsLogo ? insertLogoSnippet : undefined}
                  t={t}
                />
                <EditorContent editor={editor} />
              </div>
            ) : (
              <textarea
                value={bodyHtml}
                onChange={(ev) => setBodyHtml(ev.target.value)}
                rows={14}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs font-mono"
              />
            )}
          </div>

          {/* Macros */}
          {selected.macros.length > 0 && (
            <div className="bg-gray-50 rounded p-2">
              <p className="text-[10px] font-medium text-gray-500 mb-1.5">
                {t("ui.emailTemplates.macrosAvailable")}
              </p>
              <div className="flex flex-wrap gap-1">
                {selected.macros.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => insertMacro(m)}
                    title={t("ui.emailTemplates.macroInsertHint", { name: m })}
                    className="text-[10px] bg-white border border-gray-200 rounded px-1.5 py-0.5 text-gray-700 font-mono hover:bg-cyan/10 hover:border-cyan transition-colors"
                  >{`{{${m}}}`}</button>
                ))}
              </div>
            </div>
          )}

          {/* Footer actions */}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={handleCancel}
              disabled={!isDirty || savingKey === selected.eventKey}
              className="rounded border border-gray-300 px-4 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {t("ui.emailTemplates.btnCancel")}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!isDirty || savingKey === selected.eventKey}
              className="rounded bg-cyan px-4 py-1.5 text-xs font-medium text-white hover:bg-cyan/90 disabled:opacity-50"
            >
              {savingKey === selected.eventKey
                ? t("ui.emailTemplates.saving")
                : t("ui.emailTemplates.btnSave")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Internal: TipTap toolbar — kept inline to avoid a public sub-component for
// a piece of UI that has no use outside this editor.
// ---------------------------------------------------------------------------

interface ToolbarProps {
  editor: Editor | null;
  onLink: () => void;
  onLogo?: () => void;
  t: (key: string) => string;
}

function Toolbar({ editor, onLink, onLogo, t }: ToolbarProps) {
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
        title={t("ui.emailTemplates.btnBold")}
        className={`${btnBase} ${editor.isActive("bold") ? btnActive : ""}`}
      >
        <Bold className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleItalic().run()}
        title={t("ui.emailTemplates.btnItalic")}
        className={`${btnBase} ${editor.isActive("italic") ? btnActive : ""}`}
      >
        <Italic className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleStrike().run()}
        title={t("ui.emailTemplates.btnUnderline")}
        className={`${btnBase} ${editor.isActive("strike") ? btnActive : ""}`}
      >
        <UnderlineIcon className="h-3.5 w-3.5" />
      </button>
      <span className="mx-1 h-4 w-px bg-gray-300" />
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        title={t("ui.emailTemplates.btnH1")}
        className={`${btnBase} ${editor.isActive("heading", { level: 1 }) ? btnActive : ""}`}
      >
        <Heading1 className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        title={t("ui.emailTemplates.btnH2")}
        className={`${btnBase} ${editor.isActive("heading", { level: 2 }) ? btnActive : ""}`}
      >
        <Heading2 className="h-3.5 w-3.5" />
      </button>
      <span className="mx-1 h-4 w-px bg-gray-300" />
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        title={t("ui.emailTemplates.btnBulletList")}
        className={`${btnBase} ${editor.isActive("bulletList") ? btnActive : ""}`}
      >
        <List className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        title={t("ui.emailTemplates.btnOrderedList")}
        className={`${btnBase} ${editor.isActive("orderedList") ? btnActive : ""}`}
      >
        <ListOrdered className="h-3.5 w-3.5" />
      </button>
      <span className="mx-1 h-4 w-px bg-gray-300" />
      <button
        type="button"
        onClick={onLink}
        title={t("ui.emailTemplates.btnLink")}
        className={`${btnBase} ${editor.isActive("link") ? btnActive : ""}`}
      >
        <LinkIcon className="h-3.5 w-3.5" />
      </button>
      {onLogo && (
        <button
          type="button"
          onClick={onLogo}
          title={t("ui.emailTemplates.btnInsertLogo")}
          className={btnBase}
        >
          <ImageIcon className="h-3.5 w-3.5" />
        </button>
      )}
      <span className="mx-1 h-4 w-px bg-gray-300" />
      <button
        type="button"
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
        title={t("ui.emailTemplates.btnUndo")}
        className={btnBase}
      >
        <Undo2 className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
        title={t("ui.emailTemplates.btnRedo")}
        className={btnBase}
      >
        <Redo2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
