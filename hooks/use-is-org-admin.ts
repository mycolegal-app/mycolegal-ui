"use client";

/**
 * Returns whether the current user can administer the org. Used by
 * sidebars to conditionally render the "Administración" entry.
 *
 * Truthy when:
 *   - authRole is `org_admin` or `superadmin` (cross-app authoritative role)
 *   - or the user has the `admin:users` permission granted in this app
 *   - or the user has wildcard `*` (e.g. consultor's EDITOR_CATALOGO)
 *
 * The hook fetches `/api/auth/me` once on mount; consumers use the
 * boolean to gate the menu item without re-implementing this logic.
 */

import { useEffect, useState } from 'react';

export function useIsOrgAdmin(): boolean {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (cancelled || !json?.data) return;
        const authRole: string | undefined = json.data.authRole;
        const perms: string[] = json.data.permissions ?? [];
        const allowed =
          authRole === 'org_admin' ||
          authRole === 'superadmin' ||
          perms.includes('admin:users') ||
          perms.includes('admin:*') ||
          perms.includes('*');
        setIsAdmin(allowed);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return isAdmin;
}
