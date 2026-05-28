"use client";

import * as React from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { marked } from "marked";
import TurndownService from "turndown";
import { Bold, Italic, List, Heading2, Undo, Redo } from "lucide-react";

/**
 * Editor markdown WYSIWYG (TipTap StarterKit). Trabaja internamente con HTML
 * pero la API pública (`value` / `onChange`) habla markdown: el llamador no
 * tiene que conocer TipTap ni HTML.
 *
 * Conversión:
 *  - markdown inicial → HTML con `marked` (al montar y si `value` cambia).
 *  - HTML → markdown con `turndown` (en cada `onUpdate`).
 *
 * El toolbar es minimal y reutilizable: negrita, cursiva, lista, H2, undo/redo.
 * No exponemos enlaces ni imágenes (no aplican al caso de los resúmenes).
 */

const turndown = new TurndownService({
  headingStyle: "atx",
  bulletListMarker: "-",
  emDelimiter: "*",
  codeBlockStyle: "fenced",
});

marked.setOptions({ breaks: true, gfm: true });

function mdToHtml(md: string): string {
  if (!md) return "";
  return marked.parse(md, { async: false }) as string;
}

function htmlToMd(html: string): string {
  return turndown.turndown(html).trim();
}

interface MarkdownEditorProps {
  value: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
  /** Altura mínima del área editable (Tailwind utility, p.ej. `min-h-32`). */
  minHeightClass?: string;
  disabled?: boolean;
  /** Aria-label / label accesible (no se renderiza visualmente). */
  ariaLabel?: string;
}

interface ToolbarButtonProps {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}

function ToolbarButton({ onClick, active, disabled, title, children }: ToolbarButtonProps): React.ReactElement {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      aria-pressed={active}
      className={[
        "inline-flex h-7 w-7 items-center justify-center rounded text-gray-600 hover:bg-gray-100",
        "disabled:cursor-not-allowed disabled:opacity-40",
        active ? "bg-gray-200 text-gray-900" : "",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function Toolbar({ editor }: { editor: Editor }): React.ReactElement {
  return (
    <div className="flex items-center gap-0.5 border-b border-gray-200 bg-gray-50 px-1.5 py-1">
      <ToolbarButton
        title="Negrita (Ctrl/Cmd+B)"
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton
        title="Cursiva (Ctrl/Cmd+I)"
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic className="h-3.5 w-3.5" />
      </ToolbarButton>
      <span className="mx-1 h-4 w-px bg-gray-200" />
      <ToolbarButton
        title="Encabezado"
        active={editor.isActive("heading", { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        <Heading2 className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton
        title="Lista"
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List className="h-3.5 w-3.5" />
      </ToolbarButton>
      <span className="mx-1 h-4 w-px bg-gray-200" />
      <ToolbarButton
        title="Deshacer"
        disabled={!editor.can().undo()}
        onClick={() => editor.chain().focus().undo().run()}
      >
        <Undo className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton
        title="Rehacer"
        disabled={!editor.can().redo()}
        onClick={() => editor.chain().focus().redo().run()}
      >
        <Redo className="h-3.5 w-3.5" />
      </ToolbarButton>
    </div>
  );
}

export function MarkdownEditor({
  value,
  onChange,
  placeholder,
  minHeightClass = "min-h-32",
  disabled,
  ariaLabel,
}: MarkdownEditorProps): React.ReactElement {
  const editor = useEditor({
    extensions: [StarterKit],
    content: mdToHtml(value),
    editable: !disabled,
    editorProps: {
      attributes: {
        class: [
          "prose prose-sm max-w-none px-3 py-2 focus:outline-none",
          minHeightClass,
          "prose-p:my-1.5 prose-headings:my-2 prose-li:my-0",
        ].join(" "),
        ...(ariaLabel ? { "aria-label": ariaLabel } : {}),
        ...(placeholder ? { "data-placeholder": placeholder } : {}),
      },
    },
    onUpdate: ({ editor: ed }) => {
      onChange(htmlToMd(ed.getHTML()));
    },
    immediatelyRender: false,
  });

  // Sync externo: si `value` cambia desde fuera (carga inicial async, reset
  // tras guardar, etc.), reescribimos el contenido sin disparar onUpdate.
  React.useEffect(() => {
    if (!editor) return;
    const current = htmlToMd(editor.getHTML());
    if (current === value.trim()) return;
    editor.commands.setContent(mdToHtml(value), false);
  }, [value, editor]);

  React.useEffect(() => {
    if (editor) editor.setEditable(!disabled);
  }, [disabled, editor]);

  return (
    <div className="rounded border border-gray-300 bg-white focus-within:border-cyan-600 focus-within:ring-1 focus-within:ring-cyan-600">
      {editor && <Toolbar editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  );
}
