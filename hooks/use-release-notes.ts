"use client";

import { useEffect, useState } from "react";

export type ReleaseNotesState =
  | { status: "loading" }
  | { status: "ready"; markdown: string }
  | { status: "empty" }
  | { status: "error" };

// Module-level cache mirrors useVersionInfo: notes are immutable within
// a build, so a single fetch per page load is plenty.
let inflight: Promise<ReleaseNotesState> | null = null;

function load(): Promise<ReleaseNotesState> {
  if (inflight) return inflight;
  inflight = fetch("/api/version/notes", { cache: "no-store" })
    .then(async (r) => {
      if (r.status === 204) return { status: "empty" } as const;
      if (!r.ok) return { status: "error" } as const;
      const text = await r.text();
      if (!text.trim()) return { status: "empty" } as const;
      return { status: "ready", markdown: text } as const;
    })
    .catch(() => ({ status: "error" }) as const);
  return inflight;
}

export function useReleaseNotes(enabled: boolean): ReleaseNotesState {
  const [state, setState] = useState<ReleaseNotesState>({ status: "loading" });
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    load().then((s) => {
      if (!cancelled) setState(s);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return state;
}
