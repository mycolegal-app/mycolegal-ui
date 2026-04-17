"use client";

import { useEffect, useState } from "react";
import { Info, X } from "lucide-react";
import { useVersionInfo } from "../../hooks/use-version-info";

interface AppInfoButtonProps {
  appName: string;
  appLogoUrl?: string;
  /** Override the button style. Defaults assume a dark header. */
  className?: string;
}

// Rolled our own lightweight modal instead of Radix Dialog: when the trigger
// lives inside a position:sticky header, Radix's Presence + composeRefs chain
// repeatedly re-evaluates the forwarded refs on every render of the header's
// subtree and blows past React's 50-update depth cap (error #185). The modal
// below portals its own backdrop and has zero forwarded refs, so that cycle
// can't happen.
export function AppInfoButton({
  appName,
  appLogoUrl,
  className,
}: AppInfoButtonProps) {
  const [open, setOpen] = useState(false);
  const version = useVersionInfo();

  // Close on Escape and lock body scroll while the modal is visible —
  // the minimum ergonomics a user expects from a dialog.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Acerca de la aplicación"
        className={
          className ??
          "flex h-8 w-8 items-center justify-center rounded text-white/70 hover:text-white hover:bg-white/10"
        }
      >
        <Info className="h-4 w-4" />
      </button>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="app-info-title"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
          onClick={(e) => {
            // Backdrop click closes — ignore clicks inside the panel.
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                {appLogoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={appLogoUrl}
                    alt=""
                    className="h-8 w-8 object-contain"
                  />
                )}
                <h2 id="app-info-title" className="text-lg font-semibold text-gray-900">
                  {appName}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Cerrar"
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <dl className="mt-4 divide-y divide-gray-200 border-t border-gray-200">
              <VersionRow label="Aplicación" value={version?.app} />
              <VersionRow label="UI" value={version?.ui} />
              <VersionRow label="Auth" value={version?.auth} />
            </dl>
          </div>
        </div>
      )}
    </>
  );
}

function VersionRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex items-center justify-between py-2 text-sm">
      <dt className="text-gray-600">{label}</dt>
      <dd className="font-mono text-gray-900">{value ?? "…"}</dd>
    </div>
  );
}
