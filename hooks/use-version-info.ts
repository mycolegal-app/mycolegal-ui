"use client";

import { useEffect, useState } from "react";

export interface VersionInfo {
  app: string;
  ui: string;
  auth: string;
}

// Module-level cache so the fetch only happens once per page load no matter
// how many times the modal is mounted/opened. A failed fetch returns null
// and will be retried on the next hard navigation.
let inflight: Promise<VersionInfo | null> | null = null;

function load(): Promise<VersionInfo | null> {
  if (inflight) return inflight;
  inflight = fetch("/api/version")
    .then((r) => (r.ok ? (r.json() as Promise<VersionInfo>) : null))
    .catch(() => null);
  return inflight;
}

export function useVersionInfo(): VersionInfo | null {
  const [data, setData] = useState<VersionInfo | null>(null);
  useEffect(() => {
    let cancelled = false;
    load().then((v) => {
      if (!cancelled) setData(v);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return data;
}
