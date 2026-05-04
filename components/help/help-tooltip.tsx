"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { HelpAnnotation } from "./help-context";

interface HelpTooltipProps {
  annotation: HelpAnnotation;
  onManualClick?: (path: string) => void;
  moreInfoLabel?: string;
}

export const HELP_REPOSITION_EVENT = "mycolegal:help-repositioned";

export function HelpTooltip({ annotation, onManualClick, moreInfoLabel = "Más info →" }: HelpTooltipProps) {
  const [style, setStyle] = useState<CSSProperties>({ display: "none" });
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const position = annotation.position || "bottom";

  useEffect(() => {
    const el = document.querySelector(annotation.target);
    if (!el) return;

    function update() {
      const rect = el!.getBoundingClientRect();
      const pos = computePosition(rect, position);
      setStyle(pos);
      setVisible(true);
      window.dispatchEvent(new CustomEvent(HELP_REPOSITION_EVENT));
    }

    (el as HTMLElement).style.outline = "2px solid #00d4aa";
    (el as HTMLElement).style.outlineOffset = "2px";
    (el as HTMLElement).style.position = "relative";
    (el as HTMLElement).style.zIndex = "41";

    update();

    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);

    return () => {
      (el as HTMLElement).style.outline = "";
      (el as HTMLElement).style.outlineOffset = "";
      (el as HTMLElement).style.position = "";
      (el as HTMLElement).style.zIndex = "";
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
      window.dispatchEvent(new CustomEvent(HELP_REPOSITION_EVENT));
    };
  }, [annotation.target, position]);

  if (!visible) return null;

  return (
    <div
      ref={ref}
      data-help-tooltip="true"
      data-help-anchor={annotation.target}
      data-help-position={position}
      className="fixed z-[60] max-w-[200px] rounded-md bg-gray-900 px-2 py-1.5 text-[11px] leading-snug text-white shadow-lg"
      style={style}
    >
      <p>{annotation.text}</p>
      {annotation.manualPath && onManualClick && (
        <button
          onClick={() => onManualClick(annotation.manualPath!)}
          className="mt-1 text-[10px] text-cyan-300 hover:text-cyan-100"
        >
          {moreInfoLabel}
        </button>
      )}
      <div
        className="absolute h-1.5 w-1.5 rotate-45 bg-gray-900"
        style={arrowStyle(position)}
      />
    </div>
  );
}

function computePosition(
  rect: DOMRect,
  position: string,
): CSSProperties {
  const gap = 8;

  switch (position) {
    case "top":
      return {
        left: rect.left + rect.width / 2,
        top: rect.top - gap,
        transform: "translate(-50%, -100%)",
      };
    case "left":
      return {
        left: rect.left - gap,
        top: rect.top + rect.height / 2,
        transform: "translate(-100%, -50%)",
      };
    case "right":
      return {
        left: rect.right + gap,
        top: rect.top + rect.height / 2,
        transform: "translateY(-50%)",
      };
    case "bottom":
    default:
      return {
        left: rect.left + rect.width / 2,
        top: rect.bottom + gap,
        transform: "translateX(-50%)",
      };
  }
}

function arrowStyle(position: string): CSSProperties {
  switch (position) {
    case "top":
      return { bottom: -3, left: "50%", transform: "translateX(-50%) rotate(45deg)" };
    case "left":
      return { right: -3, top: "50%", transform: "translateY(-50%) rotate(45deg)" };
    case "right":
      return { left: -3, top: "50%", transform: "translateY(-50%) rotate(45deg)" };
    case "bottom":
    default:
      return { top: -3, left: "50%", transform: "translateX(-50%) rotate(45deg)" };
  }
}
