"use client";

import { cn } from "../../lib/utils";

interface AppCardProps {
  name: string;
  slug: string;
  description?: string | null;
  logoSvg?: string | null;
  url?: string | null;
  maintenance?: boolean;
  maintenanceMessage?: string | null;
  maintenanceEnd?: string | null;
  /** Additional className for the card container */
  className?: string;
}

export function AppCard({
  name,
  description,
  logoSvg,
  url,
  maintenance,
  maintenanceMessage,
  className,
}: AppCardProps) {
  const content = (
    <div
      className={cn(
        "group flex flex-col items-center rounded-xl border border-mc-neutral-300 bg-white p-6 text-center shadow-sm transition-all duration-normal",
        maintenance
          ? "opacity-70 cursor-not-allowed"
          : "hover:shadow-md hover:border-mc-primary-400 cursor-pointer",
        className
      )}
    >
      {/* Logo */}
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-xl border border-mc-neutral-200 bg-mc-neutral-50 p-2">
        {logoSvg ? (
          <div
            className="h-10 w-10"
            dangerouslySetInnerHTML={{ __html: logoSvg }}
          />
        ) : (
          <div className="h-10 w-10 rounded-lg bg-mc-primary-100 flex items-center justify-center">
            <span className="text-lg font-bold text-mc-primary-700">
              {name.charAt(0)}
            </span>
          </div>
        )}
      </div>

      {/* Name */}
      <h3 className="text-lg font-semibold text-mc-slate-900 group-hover:text-mc-primary-700 transition-colors">
        {name}
      </h3>

      {/* Description */}
      {description && (
        <p className="mt-2 text-sm text-mc-slate-500 line-clamp-3">
          {description}
        </p>
      )}

      {/* Maintenance badge */}
      {maintenance && (
        <div className="mt-3 rounded-full bg-mc-warning-50 border border-mc-warning-500/30 px-3 py-1 text-xs font-medium text-mc-warning-700">
          {maintenanceMessage || "En mantenimiento"}
        </div>
      )}
    </div>
  );

  if (maintenance || !url) {
    return content;
  }

  return (
    <a href={url} className="block no-underline">
      {content}
    </a>
  );
}
