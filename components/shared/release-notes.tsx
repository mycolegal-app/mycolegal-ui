"use client";

import { Fragment, type ReactNode } from "react";

// Lightweight renderer for VERSION.md. Format is intentionally narrow:
//   ## X.Y.Z — title (date)
//   Type: **major|minor|revision|patch**
//   - bullet
//   **bold**, `code`, plain paragraphs
//   git diffstat-style lines (collapsed into a <pre>)
// Anything else falls through as a plain paragraph so an unexpected
// future block never crashes the modal — worst case it looks plain.

type Block =
  | { kind: "heading"; version: string; title: string; date: string }
  | { kind: "type"; value: string }
  | { kind: "list"; items: string[] }
  | { kind: "para"; text: string }
  | { kind: "diffstat"; lines: string[] }
  | { kind: "hr" };

const TYPE_STYLES: Record<string, string> = {
  major: "bg-purple-100 text-purple-800 ring-purple-200",
  minor: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  revision: "bg-amber-100 text-amber-800 ring-amber-200",
  patch: "bg-amber-100 text-amber-800 ring-amber-200",
};

// VERSION.md grows without bound, so only the most recent releases are shown
// in the modal. Headings are newest-first, so the first N are what we keep.
const MAX_VERSIONS = 10;

export function ReleaseNotes({ markdown }: { markdown: string }) {
  const blocks = recentVersions(parse(markdown), MAX_VERSIONS);
  return (
    <div className="text-sm text-gray-800">
      {blocks.map((b, i) => renderBlock(b, i))}
    </div>
  );
}

// Keep every block up to the (max + 1)-th heading, then drop any separator
// left dangling by the cut so the list doesn't end on a stray <hr>.
function recentVersions(blocks: Block[], max: number): Block[] {
  let headings = 0;
  let end = blocks.length;
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i]!.kind === "heading" && ++headings > max) {
      end = i;
      break;
    }
  }
  while (end > 0 && blocks[end - 1]!.kind === "hr") end--;
  return blocks.slice(0, end);
}

function renderBlock(b: Block, i: number): ReactNode {
  if (b.kind === "hr") {
    return <hr key={i} className="my-4 border-gray-200" />;
  }
  if (b.kind === "heading") {
    return (
      <div
        key={i}
        className="mt-5 first:mt-0 mb-2 flex items-baseline justify-between gap-3 border-b border-gray-200 pb-1"
      >
        <h3 className="text-base font-semibold text-gray-900">
          <span className="font-mono">{b.version}</span>
          {b.title && <span className="font-normal text-gray-700"> — {b.title}</span>}
        </h3>
        {b.date && <span className="shrink-0 font-mono text-xs text-gray-500">{b.date}</span>}
      </div>
    );
  }
  if (b.kind === "type") {
    const cls =
      TYPE_STYLES[b.value.toLowerCase()] ?? "bg-gray-100 text-gray-800 ring-gray-200";
    return (
      <div key={i} className="my-2">
        <span
          className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${cls}`}
        >
          {b.value}
        </span>
      </div>
    );
  }
  if (b.kind === "list") {
    return (
      <ul key={i} className="my-2 list-disc space-y-1 pl-5 text-gray-700">
        {b.items.map((item, j) => (
          <li key={j}>{renderInline(item)}</li>
        ))}
      </ul>
    );
  }
  if (b.kind === "diffstat") {
    return (
      <pre
        key={i}
        className="my-2 overflow-x-auto rounded-md bg-gray-50 px-3 py-2 font-mono text-[11px] leading-snug text-gray-600 ring-1 ring-inset ring-gray-200"
      >
        {b.lines.join("\n")}
      </pre>
    );
  }
  return (
    <p key={i} className="my-2 leading-relaxed text-gray-700">
      {renderInline(b.text)}
    </p>
  );
}

// Inline pass: **bold**, `code`. Order matters — code first so we don't
// re-tokenize backticks inside a bold span. Group 1 = code, group 2 = bold.
// Numbered groups (not named) so this stays valid under ES2017 targets.
const INLINE_RE = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)/g;

function renderInline(text: string): ReactNode {
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const m of text.matchAll(INLINE_RE)) {
    const start = m.index ?? 0;
    if (start > last) out.push(<Fragment key={key++}>{text.slice(last, start)}</Fragment>);
    if (m[1]) {
      out.push(
        <code
          key={key++}
          className="rounded bg-gray-100 px-1 py-0.5 font-mono text-[0.85em] text-gray-800"
        >
          {m[1].slice(1, -1)}
        </code>,
      );
    } else if (m[2]) {
      out.push(
        <strong key={key++} className="font-semibold text-gray-900">
          {m[2].slice(2, -2)}
        </strong>,
      );
    }
    last = start + m[0].length;
  }
  if (last < text.length) out.push(<Fragment key={key++}>{text.slice(last)}</Fragment>);
  return out;
}

// Group 1 = version, group 2 = title (optional), group 3 = date (optional).
const HEADING_RE = /^##\s+([\w.\-]+)\s*(?:[—-]\s*(.+?))?\s*(?:\(([^)]+)\))?\s*$/;
const TYPE_RE = /^Type:\s*\*\*([^*]+)\*\*\s*$/;

function parse(md: string): Block[] {
  // Strip the file's intro (everything before the first `## ` heading).
  // Listing the title + format banner inside the modal is noise.
  const firstH2 = md.indexOf("\n## ");
  const body = firstH2 >= 0 ? md.slice(firstH2 + 1) : md;

  const lines = body.split("\n");
  const blocks: Block[] = [];
  let para: string[] = [];
  let list: string[] = [];
  let diff: string[] = [];

  const flushPara = () => {
    if (para.length) {
      blocks.push({ kind: "para", text: para.join(" ").trim() });
      para = [];
    }
  };
  const flushList = () => {
    if (list.length) {
      blocks.push({ kind: "list", items: list });
      list = [];
    }
  };
  const flushDiff = () => {
    if (diff.length) {
      blocks.push({ kind: "diffstat", lines: diff });
      diff = [];
    }
  };
  const flushAll = () => {
    flushPara();
    flushList();
    flushDiff();
  };

  // A line is "diffstat-shaped" if it looks like `path | NN +/-` or the
  // closing summary `N files changed, ...` / `K new file(s)`. Consecutive
  // such lines collapse into a single <pre>.
  const isDiffstat = (l: string) =>
    /^\s*\S.*\|\s+\d+\s/.test(l) ||
    /^\s*\d+\s+files?\s+changed/.test(l) ||
    /^\s*\d+\s+new\s+file/.test(l);

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");

    if (line === "" || line === "---") {
      flushAll();
      if (line === "---") blocks.push({ kind: "hr" });
      continue;
    }

    const h = HEADING_RE.exec(line);
    if (h) {
      flushAll();
      blocks.push({
        kind: "heading",
        version: h[1]!,
        title: (h[2] ?? "").trim(),
        date: (h[3] ?? "").trim(),
      });
      continue;
    }

    const t = TYPE_RE.exec(line.trim());
    if (t) {
      flushAll();
      blocks.push({ kind: "type", value: t[1]!.trim() });
      continue;
    }

    if (isDiffstat(line)) {
      flushPara();
      flushList();
      diff.push(line);
      continue;
    }

    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      flushPara();
      flushDiff();
      list.push(bullet[1]);
      continue;
    }

    flushList();
    flushDiff();
    para.push(line.trim());
  }
  flushAll();
  return blocks;
}
