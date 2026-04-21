"use client";

import * as React from "react";
import { cn } from "../../lib/utils";
import {
  PATHS,
  VIEWBOX,
  CANARIAS_INSET_BOX,
  CEUTA_POS,
  MELILLA_POS,
} from "./spain-ccaa-paths";

// Canonical slug derived from the official CCAA nombre. We normalise the
// caller's jurisdicciones at runtime and match them against the SVG path
// ids (of the form `ccaa-<slug>`), so the component adapts to whatever
// `codigo` convention the consumer's DB uses — INE 01–19, alphabetic, or
// anything else. Aliases cover the common spelling variants (Catalunya vs
// Cataluña, Balears vs Illes Balears, Valenciana vs C. Valenciana, …).
const NOMBRE_ALIASES: Record<string, string> = {
  "balears": "baleares",
  "illes balears": "baleares",
  "illes balears (comunitat autonoma)": "baleares",
  "catalunya": "cataluna",
  "castilla la mancha": "castilla-la-mancha",
  "castilla-la mancha": "castilla-la-mancha",
  "castilla leon": "castilla-leon",
  "castilla y leon": "castilla-leon",
  "valenciana": "valencia",
  "c. valenciana": "valencia",
  "c valenciana": "valencia",
  "comunidad valenciana": "valencia",
  "comunitat valenciana": "valencia",
  "la rioja": "la-rioja",
  "pais vasco": "pais-vasco",
  "euskadi": "pais-vasco",
};

function canonicalSlug(nombre: string): string {
  const base = nombre
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (NOMBRE_ALIASES[base]) return NOMBRE_ALIASES[base];
  return base.replace(/\s+/g, "-");
}

// --------------------------------------------------------------------------
// SpainCCAAMap
//
// Real-silhouette schematic of Spain's 19 jurisdicciones. Renders each CCAA
// as an SVG <path> with a neutral fill; state (selected / filled / focus) is
// encoded purely via opacity + stroke — no identity colours. A badge with the
// document count is pinned at each centroid and always visible when > 0.
// Canarias lives inside an inset frame (INE-style) and Ceuta + Melilla are
// rendered as label-only badges in the Strait of Gibraltar.
// --------------------------------------------------------------------------

export interface SpainCCAAMapJurisdiccion {
  id: string;
  codigo: string; // INE 2-digit code
  nombre: string;
}

export interface SpainCCAAMapProps {
  jurisdicciones: SpainCCAAMapJurisdiccion[];
  /** codigo → document count (shown as badge, used for heat shading). */
  values?: Record<string, number>;
  /** Codes rendered as selected (solid accent fill). */
  selectedCodigos?: Set<string> | string[];
  /** Codes with at least one doc — fill tinted relative to intensity. */
  filledCodigos?: Set<string> | string[];
  /** Single highlighted code (thick outline). */
  highlightCodigo?: string | null;
  mode?: "single" | "multi";
  onSelect?: (codigo: string, jur: SpainCCAAMapJurisdiccion | undefined) => void;
  interactive?: boolean;
  className?: string;
  width?: number;
  /**
   * When set, fetch a realistic-geometry SVG from this URL and render it in
   * place of the built-in schematic polygons. The SVG must contain one
   * <path id="ccaa-<slug>"> per CCAA (plus Ceuta/Melilla). Passing undefined
   * falls back to the schematic renderer so existing callers don't change.
   */
  svgSrc?: string;
}

function toSet(val?: Set<string> | string[]): Set<string> {
  if (!val) return new Set();
  return val instanceof Set ? val : new Set(val);
}

// Madrid is visually inside Castilla-La Mancha, so CLM (07) must render first
// and MD (13) after, so the Madrid path covers the CLM polygon at that spot.
const RENDER_ORDER = [
  "12", "03", "06", "16", "15", "17", "02", "09", "04",
  "08", "07", "13", "10", "14", "11", "01",
];

export function SpainCCAAMap({
  jurisdicciones,
  values,
  selectedCodigos,
  filledCodigos,
  highlightCodigo,
  mode = "single",
  onSelect,
  interactive = true,
  className,
  width = 480,
  svgSrc,
}: SpainCCAAMapProps) {
  const selSet = toSet(selectedCodigos);
  const filledSet = toSet(filledCodigos);

  // Hooks must run in a stable order across every render, so we declare them
  // all first and only branch on rendering afterwards.
  const [svgFallback, setSvgFallback] = React.useState(false);

  const byCodigo = React.useMemo(() => {
    const m = new Map<string, SpainCCAAMapJurisdiccion>();
    for (const j of jurisdicciones) m.set(j.codigo, j);
    return m;
  }, [jurisdicciones]);

  const maxValue = React.useMemo(() => {
    if (!values) return 0;
    return Math.max(0, ...Object.values(values));
  }, [values]);

  // Branch after all hooks have run: if `svgSrc` is set AND the fetch hasn't
  // yet failed, render the realistic SVG. Any fetch error flips us back to
  // the schematic below.
  if (svgSrc && !svgFallback) {
    return (
      <RealisticCCAAMap
        svgSrc={svgSrc}
        jurisdicciones={jurisdicciones}
        values={values || {}}
        selSet={selSet}
        filledSet={filledSet}
        highlightCodigo={highlightCodigo ?? null}
        mode={mode}
        interactive={interactive}
        onSelect={onSelect}
        className={className}
        width={width}
        onError={() => setSvgFallback(true)}
      />
    );
  }

  const { width: vbW, height: vbH } = VIEWBOX;

  function fillFor(codigo: string) {
    if (selSet.has(codigo)) return "#0891b2"; // cyan-600 — selected
    if (highlightCodigo === codigo) return "#164e63"; // cyan-900 — active filter
    if (filledSet.has(codigo)) {
      const intensity = values && maxValue > 0 ? (values[codigo] || 0) / maxValue : 0.4;
      const alpha = 0.18 + intensity * 0.55;
      return `rgba(6, 182, 212, ${alpha.toFixed(2)})`;
    }
    return "#f3f4f6"; // gray-100
  }

  function strokeFor(codigo: string) {
    if (highlightCodigo === codigo) return "#164e63";
    if (selSet.has(codigo)) return "#0e7490";
    return "#9ca3af"; // gray-400
  }

  function strokeWidthFor(codigo: string) {
    if (highlightCodigo === codigo) return 2.5;
    if (selSet.has(codigo)) return 1.8;
    return 0.8;
  }

  function textInsideIsLight(codigo: string) {
    return selSet.has(codigo) || highlightCodigo === codigo;
  }

  function handleClick(codigo: string) {
    if (!interactive || !onSelect) return;
    onSelect(codigo, byCodigo.get(codigo));
  }

  function renderBadge(codigo: string, x: number, y: number) {
    const count = values?.[codigo] ?? 0;
    if (count <= 0) return null;
    const isDark = textInsideIsLight(codigo);
    return (
      <g style={{ pointerEvents: "none" }}>
        <circle
          cx={x}
          cy={y}
          r={12}
          fill={isDark ? "#ffffff" : "#0e7490"}
          stroke={isDark ? "#0e7490" : "#ffffff"}
          strokeWidth={1.5}
        />
        <text
          x={x}
          y={y + 1}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={11}
          fontWeight={700}
          fill={isDark ? "#0e7490" : "#ffffff"}
        >
          {count}
        </text>
      </g>
    );
  }

  function renderLabelBadge(
    codigo: string,
    x: number,
    y: number,
    label: string,
  ) {
    const jur = byCodigo.get(codigo);
    const count = values?.[codigo] ?? 0;
    const isSelected = selSet.has(codigo);
    const isHighlight = highlightCodigo === codigo;
    const bg = isSelected ? "#0891b2" : isHighlight ? "#164e63" : "#f3f4f6";
    const textColor = isSelected || isHighlight ? "#ffffff" : "#374151";
    const stroke = isSelected || isHighlight ? "#164e63" : "#9ca3af";

    return (
      <g
        key={codigo}
        onClick={() => handleClick(codigo)}
        className={cn(interactive && "cursor-pointer")}
        data-codigo={codigo}
      >
        <title>
          {jur?.nombre || label}
          {count > 0 ? ` — ${count} docs` : ""}
        </title>
        <rect
          x={x - 26}
          y={y - 11}
          width={52}
          height={22}
          rx={11}
          fill={bg}
          stroke={stroke}
          strokeWidth={isSelected || isHighlight ? 1.6 : 0.8}
        />
        <text
          x={x - 8}
          y={y + 1}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={10}
          fontWeight={600}
          fill={textColor}
          style={{ pointerEvents: "none" }}
        >
          {label}
        </text>
        {count > 0 && (
          <>
            <circle
              cx={x + 14}
              cy={y}
              r={8}
              fill={isSelected || isHighlight ? "#ffffff" : "#0e7490"}
              style={{ pointerEvents: "none" }}
            />
            <text
              x={x + 14}
              y={y + 1}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={9}
              fontWeight={700}
              fill={isSelected || isHighlight ? "#0e7490" : "#ffffff"}
              style={{ pointerEvents: "none" }}
            >
              {count}
            </text>
          </>
        )}
      </g>
    );
  }

  return (
    <svg
      viewBox={`0 0 ${vbW} ${vbH}`}
      width={width}
      height={(width * vbH) / vbW}
      className={cn("select-none", className)}
      role="img"
      aria-label="Mapa de España por comunidades autónomas"
    >
      {/* Canarias inset frame */}
      <rect
        x={CANARIAS_INSET_BOX[0]}
        y={CANARIAS_INSET_BOX[1]}
        width={CANARIAS_INSET_BOX[2]}
        height={CANARIAS_INSET_BOX[3]}
        rx={4}
        fill="none"
        stroke="#d1d5db"
        strokeDasharray="4,3"
        strokeWidth={1}
      />
      <text
        x={CANARIAS_INSET_BOX[0] + 8}
        y={CANARIAS_INSET_BOX[1] + 14}
        fontSize={10}
        fill="#6b7280"
      >
        Canarias
      </text>

      {/* CCAA paths (Canarias too — drawn inside its inset box) */}
      {[...RENDER_ORDER, "05"].map((codigo) => {
        const path = PATHS[codigo];
        if (!path) return null;
        const jur = byCodigo.get(codigo);
        return (
          <g
            key={codigo}
            onClick={() => handleClick(codigo)}
            className={cn(
              interactive && "cursor-pointer transition-colors",
            )}
            data-codigo={codigo}
          >
            <title>
              {jur?.nombre || path.shortLabel}
              {values?.[codigo] ? ` — ${values[codigo]} docs` : ""}
            </title>
            <path
              d={path.d}
              fill={fillFor(codigo)}
              stroke={strokeFor(codigo)}
              strokeWidth={strokeWidthFor(codigo)}
              strokeLinejoin="round"
              fillRule="evenodd"
            />
          </g>
        );
      })}

      {/* Count badges — after paths so they always stay on top */}
      {[...RENDER_ORDER, "05"].map((codigo) => {
        const path = PATHS[codigo];
        if (!path) return null;
        return (
          <React.Fragment key={`badge-${codigo}`}>
            {renderBadge(codigo, path.centroid[0], path.centroid[1])}
          </React.Fragment>
        );
      })}

      {/* Ceuta + Melilla — label-only pill badges in the Strait */}
      {renderLabelBadge("18", CEUTA_POS[0], CEUTA_POS[1], "Ceuta")}
      {renderLabelBadge("19", MELILLA_POS[0], MELILLA_POS[1], "Melilla")}
    </svg>
  );
}

// ────────────────────────── RealisticCCAAMap ──────────────────────────
// Fetches the high-fidelity SVG once, mounts it inside a host div, and
// drives all visual state (selected / filled / highlight / counts) by
// querying paths by their `id="ccaa-<slug>"` and toggling attributes +
// CSS classes. The consumer API is identical to the schematic mode.

interface RealisticProps {
  svgSrc: string;
  jurisdicciones: SpainCCAAMapJurisdiccion[];
  values: Record<string, number>;
  selSet: Set<string>;
  filledSet: Set<string>;
  highlightCodigo: string | null;
  mode: "single" | "multi";
  interactive: boolean;
  onSelect?: (codigo: string, jur: SpainCCAAMapJurisdiccion | undefined) => void;
  className?: string;
  width: number;
  onError?: () => void;
}

function RealisticCCAAMap({
  svgSrc,
  jurisdicciones,
  values,
  selSet,
  filledSet,
  highlightCodigo,
  interactive,
  onSelect,
  className,
  width,
  onError,
}: RealisticProps) {
  const hostRef = React.useRef<HTMLDivElement | null>(null);
  const [svgMarkup, setSvgMarkup] = React.useState<string | null>(null);

  const byCodigo = React.useMemo(() => {
    const m = new Map<string, SpainCCAAMapJurisdiccion>();
    for (const j of jurisdicciones) m.set(j.codigo, j);
    return m;
  }, [jurisdicciones]);

  // Slug → codigo resolved against the runtime jurisdicciones list, not a
  // hardcoded INE table. If the same slug maps to more than one jur (e.g.
  // duplicated "Valenciana" rows in the DB), we keep the numeric canonical
  // codigo over opaque cuid-style codes.
  const slugToCodigo = React.useMemo(() => {
    const m = new Map<string, string>();
    const isNumeric = (s: string) => /^\d+$/.test(s);
    for (const j of jurisdicciones) {
      const slug = canonicalSlug(j.nombre);
      const prev = m.get(slug);
      if (!prev || (isNumeric(j.codigo) && !isNumeric(prev))) {
        m.set(slug, j.codigo);
      }
    }
    return m;
  }, [jurisdicciones]);

  const maxValue = React.useMemo(() => {
    const nums = Object.values(values);
    return nums.length ? Math.max(...nums) : 0;
  }, [values]);

  // Fetch the SVG once per src. We dump the raw <svg> markup into the host
  // div — after that, every style update is a direct DOM attribute tweak.
  // On any failure (404, wrong content-type, network) we signal the parent
  // so it can drop back to the schematic renderer.
  React.useEffect(() => {
    let cancelled = false;
    fetch(svgSrc)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      })
      .then((text) => {
        if (cancelled) return;
        if (!/^<\?xml|<svg/i.test(text.trim())) {
          throw new Error("Response is not an SVG");
        }
        setSvgMarkup(text);
      })
      .catch(() => {
        if (!cancelled) onError?.();
      });
    return () => {
      cancelled = true;
    };
  }, [svgSrc, onError]);

  // Wire click handlers once the markup mounts. We re-run whenever the SVG
  // markup changes, but not on every state change — the apply-styling effect
  // below handles those cheaply.
  React.useEffect(() => {
    if (!svgMarkup || !hostRef.current) return;
    const root = hostRef.current.querySelector("svg");
    if (!root) return;
    // Make the svg scale to the host width.
    root.removeAttribute("width");
    root.removeAttribute("height");
    root.setAttribute("width", "100%");
    root.setAttribute("height", "auto");
    root.style.display = "block";
    root.style.maxWidth = "100%";

    const paths = root.querySelectorAll<SVGPathElement>('[id^="ccaa-"]');
    // An SVG without any ccaa-* paths is almost certainly a placeholder or a
    // broken asset — fall back to the schematic so the user still sees a map.
    if (paths.length === 0) {
      onError?.();
      return;
    }
    const handlers: Array<() => void> = [];
    paths.forEach((p) => {
      const idAttr = p.getAttribute("id") || "";
      const slug = idAttr.replace(/^ccaa-/, "");
      const codigo = slugToCodigo.get(slug);
      if (!codigo) return;
      p.setAttribute("data-codigo", codigo);
      if (interactive) {
        p.style.cursor = "pointer";
        const onClick = () => {
          onSelect?.(codigo, byCodigo.get(codigo));
        };
        p.addEventListener("click", onClick);
        handlers.push(() => p.removeEventListener("click", onClick));
      }
      // Tooltip via <title> for accessibility. Replace any existing one.
      const existing = p.querySelector("title");
      if (existing) existing.remove();
      const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
      const jur = byCodigo.get(codigo);
      title.textContent = `${jur?.nombre || slug}`;
      p.appendChild(title);
    });
    return () => {
      handlers.forEach((off) => off());
    };
  }, [svgMarkup, interactive, onSelect, byCodigo, slugToCodigo, onError]);

  // Apply styling (fill, stroke, count badges) on every state change. We
  // drive it via inline `style` so the result beats whatever CSS rules the
  // source SVG ships with (the stock SVG styles `.ccaa { fill: #fff }` and
  // `.ccaa.selected { fill: ... }`, which would otherwise win over plain
  // presentation attributes like `fill="..."`.
  React.useEffect(() => {
    if (!svgMarkup || !hostRef.current) return;
    const root = hostRef.current.querySelector("svg");
    if (!root) return;

    const paths = root.querySelectorAll<SVGPathElement>('[id^="ccaa-"]');
    paths.forEach((p) => {
      const codigo = p.getAttribute("data-codigo") || "";
      if (!codigo) return;
      const isSelected = selSet.has(codigo);
      const isHighlight = highlightCodigo === codigo;
      const isFilled = filledSet.has(codigo);
      const intensity =
        maxValue > 0 ? (values[codigo] || 0) / maxValue : 0.4;
      const alpha = 0.18 + intensity * 0.55;

      let fill = "#ffffff";
      if (isSelected) fill = "#0891b2";
      else if (isHighlight) fill = "#164e63";
      else if (isFilled) fill = `rgba(6, 182, 212, ${alpha.toFixed(2)})`;

      let stroke = "#6b7280";
      if (isHighlight) stroke = "#164e63";
      else if (isSelected) stroke = "#0e7490";

      const sw = isHighlight ? 2.2 : isSelected ? 1.6 : 0.9;

      p.style.fill = fill;
      p.style.stroke = stroke;
      p.style.strokeWidth = String(sw);
      p.style.strokeLinejoin = "round";
      p.style.transition = "fill 120ms ease, stroke 120ms ease";
      // Also toggle the `selected` class so the source SVG's own hover rule
      // (`.ccaa:hover { fill: ... }`) still looks right on unselected paths.
      if (isSelected) p.classList.add("selected");
      else p.classList.remove("selected");
    });

    // Count badges live in a dedicated overlay <g> so we can clear + repaint
    // without touching the underlying paths.
    let overlay = root.querySelector<SVGGElement>("#ccaa-count-overlay");
    if (!overlay) {
      overlay = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "g",
      ) as SVGGElement;
      overlay.setAttribute("id", "ccaa-count-overlay");
      overlay.setAttribute("pointer-events", "none");
      root.appendChild(overlay);
    }
    overlay.replaceChildren();

    paths.forEach((p) => {
      const codigo = p.getAttribute("data-codigo") || "";
      const count = values[codigo] || 0;
      if (count <= 0) return;
      const bbox = (p as SVGGraphicsElement).getBBox();
      const cx = bbox.x + bbox.width / 2;
      const cy = bbox.y + bbox.height / 2;
      const isSelected = selSet.has(codigo) || highlightCodigo === codigo;
      const circle = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "circle",
      );
      circle.setAttribute("cx", String(cx));
      circle.setAttribute("cy", String(cy));
      circle.setAttribute("r", "14");
      circle.setAttribute("fill", isSelected ? "#ffffff" : "#0e7490");
      circle.setAttribute("stroke", isSelected ? "#0e7490" : "#ffffff");
      circle.setAttribute("stroke-width", "1.5");
      overlay!.appendChild(circle);
      const text = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "text",
      );
      text.setAttribute("x", String(cx));
      text.setAttribute("y", String(cy + 1));
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("dominant-baseline", "middle");
      text.setAttribute("font-size", "13");
      text.setAttribute("font-weight", "700");
      text.setAttribute("fill", isSelected ? "#0e7490" : "#ffffff");
      text.textContent = String(count);
      overlay!.appendChild(text);
    });
  }, [svgMarkup, selSet, filledSet, highlightCodigo, values, maxValue]);

  if (!svgMarkup) {
    return (
      <div
        className={cn("flex items-center justify-center text-xs text-gray-400", className)}
        style={{ width, height: (width * 3) / 4 }}
      >
        Cargando mapa…
      </div>
    );
  }

  return (
    <div
      ref={hostRef}
      className={cn("select-none", className)}
      style={{ width: "100%", maxWidth: width }}
      role="img"
      aria-label="Mapa de España por comunidades autónomas"
      dangerouslySetInnerHTML={{ __html: svgMarkup }}
    />
  );
}
