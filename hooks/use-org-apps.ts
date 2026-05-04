"use client";

import { useEffect, useState } from "react";

// Cache module-level: las apps habilitadas no cambian durante una sesión
// (cambian sólo cuando el admin las activa, lo cual obliga a re-login),
// así que no tiene sentido refetchearlas en cada componente. La promesa
// es compartida entre llamantes simultáneos para no disparar N requests.
let appsPromise: Promise<Set<string>> | null = null;

async function fetchOrgApps(): Promise<Set<string>> {
  if (appsPromise) return appsPromise;
  appsPromise = (async () => {
    try {
      const res = await fetch("/api/org/apps-habilitadas");
      if (!res.ok) return new Set<string>();
      const json = (await res.json()) as { data?: { apps?: string[] } };
      return new Set<string>(json.data?.apps ?? []);
    } catch {
      return new Set<string>();
    }
  })();
  return appsPromise;
}

/**
 * Resetea el cache de apps habilitadas. Útil tras un cambio de
 * org/usuario en la misma SPA (raro: normalmente forzamos full reload).
 */
export function invalidateOrgApps() {
  appsPromise = null;
}

/**
 * Hook que devuelve el Set de slugs de apps que la organización del
 * usuario autenticado tiene contratadas (activas en `OrgApp`).
 *
 * Estado:
 * - `loading`: true mientras llega la primera respuesta
 * - `apps`: Set vacío hasta que carga, luego los slugs
 *
 * Pensado para gating de funcionalidad cross-app: por ejemplo, deshabilitar
 * un botón de "Generar documento (DocFilling)" cuando la org no tiene la
 * app `docfilling` contratada, mostrando un tooltip explicativo.
 */
export function useOrgApps(): { apps: Set<string>; loading: boolean } {
  const [apps, setApps] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchOrgApps().then((s) => {
      if (cancelled) return;
      setApps(s);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { apps, loading };
}

/**
 * Atajo: ¿está activa la app `slug` para la org actual?
 *
 * Devuelve `null` mientras carga (los call-sites pueden tratarlo como
 * "todavía no decidido" para evitar parpadeos del estado disabled).
 */
export function useIsAppEnabled(slug: string): boolean | null {
  const { apps, loading } = useOrgApps();
  if (loading) return null;
  return apps.has(slug);
}
