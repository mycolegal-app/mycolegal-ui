"use client";

import { useEffect, useState, type CSSProperties } from "react";
import type { HelpAnnotation } from "./help-context";

interface HelpTooltipProps {
  annotation: HelpAnnotation;
  onManualClick?: (path: string) => void;
}

export function HelpTooltip({ annotation, onManualClick }: HelpTooltipProps) {
  const [style, setStyle] = useState<CSSProperties>({ display: "none" });
  const [visible, setVisible] = useState(false);
  const position = annotation.position || "bottom";

  useEffect(() => {
    const el = document.querySelector(annotation.target);
    if (!el) return;

    function update() {
      const rect = el!.getBoundingClientRect();
      const pos = computePosition(rect, position);
      setStyle(pos);
      setVisible(true);
    }

    // Highlight the target element
    (el as HTMLElement).style.outline = "2px solid #00d4aa";
    (el as HTMLElement).style.outlineOffset = "2px";
    (el as HTMLElement).style.position = "relative";
    (el as HTMLElement).style.zIndex = "41";

    update();

    // Recalculate on scroll/resize
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);

    return () => {
      (el as HTMLElement).style.outline = "";
      (el as HTMLElement).style.outlineOffset = "";
      (el as HTMLElement).style.position = "";
      (el as HTMLElement).style.zIndex = "";
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [annotation.target, position]);

  if (!visible) return null;

  return (
    <div
      className="fixed z-[60] max-w-xs rounded-lg bg-gray-900 px-3 py-2 text-sm text-white shadow-xl"
      style={style}
    >
      <p>{annotation.text}</p>
      {annotation.manualPath && onManualClick && (
        <button
          onClick={() => onManualClick(annotation.manualPath!)}
          className="mt-1 text-xs text-cyan-300 hover:text-cyan-100"
        >
          Más info →
        </button>
      )}
      {/* Arrow */}
      <div
        className="absolute h-2 w-2 rotate-45 bg-gray-900"
        style={arrowStyle(position)}
      />
    </div>
  );
}

function computePosition(
  rect: DOMRect,
  position: string,
): CSSProperties {
  const gap = 10;

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
      return { bottom: -4, left: "50%", transform: "translateX(-50%) rotate(45deg)" };
    case "left":
      return { right: -4, top: "50%", transform: "translateY(-50%) rotate(45deg)" };
    case "right":
      return { left: -4, top: "50%", transform: "translateY(-50%) rotate(45deg)" };
    case "bottom":
    default:
      return { top: -4, left: "50%", transform: "translateX(-50%) rotate(45deg)" };
  }
}
