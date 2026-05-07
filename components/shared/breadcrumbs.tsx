"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronRight, Home } from "lucide-react";
import { NavLink } from "./nav-link";
import { useI18n } from "../i18n/i18n-context";

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

const DEFAULT_LABEL_KEYS: Record<string, string> = {
  nuevo: "ui.breadcrumbs.nuevo",
  nueva: "ui.breadcrumbs.nueva",
  admin: "ui.breadcrumbs.admin",
  manual: "ui.breadcrumbs.manual",
  faq: "ui.breadcrumbs.faq",
};

function isId(segment: string): boolean {
  return segment.length > 15 && /^[a-z0-9]+$/i.test(segment);
}

export function Breadcrumbs({
  routeLabels = {},
  homeLabel,
  homePath = "/",
}: BreadcrumbsProps) {
  const { t } = useI18n();
  const resolvedHomeLabel = homeLabel ?? t("ui.breadcrumbs.home");
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

  // Resolve default labels from i18n keys (override-friendly via routeLabels prop).
  const defaultLabels: Record<string, string> = {};
  for (const [seg, key] of Object.entries(DEFAULT_LABEL_KEYS)) {
    defaultLabels[seg] = t(key);
  }
  const labels = { ...defaultLabels, ...routeLabels };

  const crumbs: { label: string; href: string }[] = [
    { label: resolvedHomeLabel, href: homePath },
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
      aria-label={t("ui.breadcrumbs.aria")}
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
