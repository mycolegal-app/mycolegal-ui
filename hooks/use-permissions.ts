"use client";

/**
 * Lee los permisos efectivos del usuario actual desde `/api/auth/me` (un solo
 * fetch al montar) y expone `hasPermission("scope:action")`. Devuelve
 * `permissions: null` mientras carga, para distinguir "todavía no sé" de "ya sé
 * y no tiene".
 *
 * `hasPermission` reconoce wildcards `*` y `scope:*`, coherente con la
 * resolución de permisos del backend. Se usa en los sidebars para ocultar
 * entradas a las que el usuario no tiene acceso (evita 403 a posteriori).
 *
 * Prioriza SIEMPRE la lista de permisos efectivos (`permissions`), no el rol
 * estático, para no divergir del cálculo real del backend.
 */

import { useEffect, useMemo, useState } from "react";

export interface UsePermissionsResult {
  permissions: string[] | null;
  appRole: string | null;
  authRole: string | null;
  loading: boolean;
  hasPermission: (key: string) => boolean;
}

export function usePermissions(): UsePermissionsResult {
  const [permissions, setPermissions] = useState<string[] | null>(null);
  const [appRole, setAppRole] = useState<string | null>(null);
  const [authRole, setAuthRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (cancelled) return;
        if (json?.data) {
          setPermissions(Array.isArray(json.data.permissions) ? json.data.permissions : []);
          setAppRole(typeof json.data.appRole === "string" ? json.data.appRole : null);
          setAuthRole(typeof json.data.authRole === "string" ? json.data.authRole : null);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const hasPermission = useMemo(() => {
    return (key: string) => {
      if (!permissions) return false;
      if (permissions.includes("*")) return true;
      if (permissions.includes(key)) return true;
      const scope = key.split(":")[0];
      if (scope && permissions.includes(`${scope}:*`)) return true;
      return false;
    };
  }, [permissions]);

  return { permissions, appRole, authRole, loading, hasPermission };
}
