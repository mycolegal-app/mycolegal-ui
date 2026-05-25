"use client";

import { useEffect, useState } from "react";
import { Info, X } from "lucide-react";
import { useVersionInfo } from "../../hooks/use-version-info";
import { useReleaseNotes } from "../../hooks/use-release-notes";
import { ReleaseNotes } from "./release-notes";
import { useI18n } from "../i18n/i18n-context";

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
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const version = useVersionInfo();
  const notes = useReleaseNotes(open);

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
        aria-label={t("ui.appInfo.btnAria")}
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
          <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-gray-200 p-6 pb-4">
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
                aria-label={t("ui.docfilling.close")}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="overflow-y-auto px-6 py-4">
              <dl className="divide-y divide-gray-200 border-b border-gray-200 pb-2">
                <VersionRow label={t("ui.appInfo.versionApp")} value={version?.app} />
                <VersionRow label={t("ui.appInfo.versionUi")} value={version?.ui} />
                {version?.sharedlib && (
                  <VersionRow label={t("ui.appInfo.versionSharedlib")} value={version.sharedlib} />
                )}
                <VersionRow label={t("ui.appInfo.versionAuth")} value={version?.auth} />
              </dl>
              <h3 className="mt-5 mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
                {t("ui.appInfo.releaseNotes")}
              </h3>
              <NotesBody state={notes} />
            </div>
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

function NotesBody({ state }: { state: ReturnType<typeof useReleaseNotes> }) {
  const { t } = useI18n();
  if (state.status === "loading") {
    return <p className="text-sm text-gray-500">{t("ui.docfilling.loading")}</p>;
  }
  if (state.status === "empty") {
    return <p className="text-sm text-gray-500">{t("ui.appInfo.notesEmpty")}</p>;
  }
  if (state.status === "error") {
    return <p className="text-sm text-gray-500">{t("ui.appInfo.notesError")}</p>;
  }
  return <ReleaseNotes markdown={state.markdown} />;
}
