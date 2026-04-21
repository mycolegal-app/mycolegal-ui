"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronRight, Home } from "lucide-react";
import { NavLink } from "./nav-link";

interface BreadcrumbsProps {
  routeLabels?: Record<string, string>;
  homeLabel?: string;
  homePath?: string;
}

const DYNAMIC_LABEL_EVENT = "mycolegal:breadcrumb-label";

interface DynamicLabelDetail {
  segment: string;
  label: string;
}

/**
 * Pages can override the visible label for a dynamic URL segment (typically
 * an ID) by dispatching a custom event. This is a lightweight side channel
 * so detail pages don't need a context provider.
 */
export function setBreadcrumbLabel(segment: string, label: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<DynamicLabelDetail>(DYNAMIC_LABEL_EVENT, {
      detail: { segment, label },
    }),
  );
}

const DEFAULT_LABELS: Record<string, string> = {
  nuevo: "Nuevo",
  nueva: "Nueva",
  admin: "Administración",
  manual: "Manual",
  faq: "FAQ",
};

function isId(segment: string): boolean {
  return segment.length > 15 && /^[a-z0-9]+$/i.test(segment);
}

export function Breadcrumbs({
  routeLabels = {},
  homeLabel = "Inicio",
  homePath = "/",
}: BreadcrumbsProps) {
  const pathname = usePathname();
  const [dynamicLabels, setDynamicLabels] = useState<Record<string, string>>({});

  useEffect(() => {
    function handler(e: Event) {
      const detail = (e as CustomEvent<DynamicLabelDetail>).detail;
      if (!detail?.segment || !detail?.label) return;
      setDynamicLabels((prev) =>
        prev[detail.segment] === detail.label ? prev : { ...prev, [detail.segment]: detail.label },
      );
    }
    window.addEventListener(DYNAMIC_LABEL_EVENT, handler);
    return () => window.removeEventListener(DYNAMIC_LABEL_EVENT, handler);
  }, []);

  // Reset overrides when navigating to a new route — labels from the previous
  // page's IDs would be stale.
  useEffect(() => {
    setDynamicLabels({});
  }, [pathname]);

  if (pathname === homePath) return null;

  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return null;

  const labels = { ...DEFAULT_LABELS, ...routeLabels };

  const crumbs: { label: string; href: string }[] = [
    { label: homeLabel, href: homePath },
  ];

  let currentPath = "";
  for (const segment of segments) {
    currentPath += `/${segment}`;
    if (dynamicLabels[segment]) {
      crumbs.push({ label: dynamicLabels[segment], href: currentPath });
    } else if (isId(segment)) {
      crumbs.push({ label: `#${segment.slice(0, 8)}…`, href: currentPath });
    } else {
      crumbs.push({ label: labels[segment] || segment, href: currentPath });
    }
  }

  return (
    <nav
      aria-label="Breadcrumb"
      className="flex items-center gap-1.5 px-6 py-2 text-xs text-gray-500 bg-gray-50/80 border-b"
    >
      {crumbs.map((crumb, idx) => {
        const isLast = idx === crumbs.length - 1;
        return (
          <span key={crumb.href} className="flex items-center gap-1.5">
            {idx > 0 && <ChevronRight className="h-3 w-3 text-gray-400" />}
            {idx === 0 && <Home className="h-3 w-3" />}
            {isLast ? (
              <span className="font-medium text-gray-700">{crumb.label}</span>
            ) : (
              <NavLink
                href={crumb.href}
                className="hover:text-mc-primary-600 transition-colors"
              >
                {crumb.label}
              </NavLink>
            )}
          </span>
        );
      })}
    </nav>
  );
}
