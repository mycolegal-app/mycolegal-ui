"use client";

/**
 * Cross-app permissions modal.
 *
 * Renders one same-size card per active app of the org plus an org-level
 * role toggle on top. The user picks which apps the target user can
 * access and the role per app; on save, the diff against the initial
 * state is sent to `${apiBase}/permissions/{authUserId}` (PUT).
 *
 * Catalog (apps + roles) is fetched once from `${apiBase}/apps-catalog`
 * — passed in as a prop so the parent panel can cache it across rows.
 */

import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';

import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { useI18n } from '../i18n/i18n-context';
import { toast } from '../../hooks/use-toast';
import type { UserRow } from './users-admin-panel';

export interface AppCatalogEntry {
  slug: string;
  name: string;
  roles: Array<{ key: string; label: string; isDefault: boolean; permissions: string[] }>;
}

export interface UserPermissionsModalProps {
  open: boolean;
  user: UserRow | null;
  apps: AppCatalogEntry[];
  loadingCatalog: boolean;
  apiBase: string;
  /** Slug of the app the panel is mounted in — used to seed initial permissions. */
  currentAppSlug: string;
  /** Show the org-level role toggle (org_admin vs user). */
  showOrgRole?: boolean;
  /** Slug whose access cannot be removed (e.g., the app you're administering from). */
  protectedAppSlug?: string;
  onClose: () => void;
  onSaved: () => void;
}

export function UserPermissionsModal(props: UserPermissionsModalProps) {
  const {
    open,
    user,
    apps,
    loadingCatalog,
    apiBase,
    currentAppSlug,
    showOrgRole = true,
    protectedAppSlug,
    onClose,
    onSaved,
  } = props;
  const { t } = useI18n();

  const initialPermissions = useMemo(() => {
    const map = new Map<string, string>();
    if (!user) return map;
    if (user.hasAppAccess && user.role) map.set(currentAppSlug, user.role);
    for (const app of user.otherApps ?? []) {
      if (app.appRoleKey) map.set(app.slug, app.appRoleKey);
    }
    return map;
  }, [user, currentAppSlug]);

  const initialOrgAdmin = user?.authRole === 'org_admin';

  const [permissions, setPermissions] = useState<Map<string, string>>(initialPermissions);
  const [orgAdmin, setOrgAdmin] = useState(initialOrgAdmin);
  const [saving, setSaving] = useState(false);

  // Reset state every time the modal opens for a different user.
  useEffect(() => {
    if (open) {
      setPermissions(new Map(initialPermissions));
      setOrgAdmin(initialOrgAdmin);
    }
  }, [open, initialPermissions, initialOrgAdmin]);

  function defaultRoleFor(slug: string): string {
    const app = apps.find((a) => a.slug === slug);
    if (!app || app.roles.length === 0) return '';
    return (app.roles.find((r) => r.isDefault) ?? app.roles[0]).key;
  }

  function setAccess(slug: string, hasAccess: boolean) {
    setPermissions((prev) => {
      const next = new Map(prev);
      if (hasAccess) {
        if (!next.has(slug)) next.set(slug, defaultRoleFor(slug));
      } else {
        next.delete(slug);
      }
      return next;
    });
  }

  function setRole(slug: string, role: string) {
    setPermissions((prev) => {
      const next = new Map(prev);
      next.set(slug, role);
      return next;
    });
  }

  async function handleSave() {
    if (!user) return;
    const grants: Array<{ slug: string; appRoleKey: string }> = [];
    const removeApps: string[] = [];

    for (const [slug, role] of permissions) {
      const initial = initialPermissions.get(slug);
      if (initial !== role) {
        grants.push({ slug, appRoleKey: role });
      }
    }
    for (const slug of initialPermissions.keys()) {
      if (!permissions.has(slug)) removeApps.push(slug);
    }

    const body: Record<string, unknown> = {
      apps: grants,
      removeApps,
      displayName: user.displayName,
      email: user.email,
    };
    if (showOrgRole && orgAdmin !== initialOrgAdmin) {
      body.authRole = orgAdmin ? 'org_admin' : 'user';
    }

    if (grants.length === 0 && removeApps.length === 0 && body.authRole === undefined) {
      onClose();
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`${apiBase}/permissions/${user.authUserId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast({
          title: err.error?.message || t('ui.usersAdmin.toastPermissionsError'),
          variant: 'destructive',
        });
        return;
      }
      toast({ title: t('ui.usersAdmin.toastPermissionsSaved'), variant: 'success' });
      onSaved();
      onClose();
    } catch (error) {
      console.error(error);
      toast({ title: t('ui.usersAdmin.toastPermissionsError'), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => (!v && !saving ? onClose() : null)}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('ui.usersAdmin.modalTitle', { name: user.displayName })}</DialogTitle>
          <DialogDescription>{t('ui.usersAdmin.modalSubtitle')}</DialogDescription>
        </DialogHeader>

        {showOrgRole && (
          <div className="rounded-lg border p-3 flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <div className="text-sm font-medium">{t('ui.usersAdmin.modalOrgRole')}</div>
              <div className="text-xs text-muted-foreground">
                {t('ui.usersAdmin.modalOrgRoleHint')}
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <span className="text-xs text-muted-foreground">
                {orgAdmin
                  ? t('ui.usersAdmin.orgRoleAdmin')
                  : t('ui.usersAdmin.orgRoleUser')}
              </span>
              <input
                type="checkbox"
                checked={orgAdmin}
                onChange={(e) => setOrgAdmin(e.target.checked)}
                disabled={saving}
                className="h-4 w-4 rounded border-input text-primary focus:ring-2 focus:ring-ring"
              />
            </label>
          </div>
        )}

        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            {t('ui.usersAdmin.modalAppsHeader')}
          </h4>

          {loadingCatalog ? (
            <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              {t('ui.usersAdmin.modalLoadingCatalog')}
            </div>
          ) : apps.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              {t('ui.usersAdmin.modalNoApps')}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {apps.map((app) => {
                const access = permissions.has(app.slug);
                const role = permissions.get(app.slug) ?? defaultRoleFor(app.slug);
                const isProtected = app.slug === protectedAppSlug;
                return (
                  <div
                    key={app.slug}
                    className="rounded-lg border p-3 flex flex-col gap-2 min-h-[120px]"
                  >
                    <label className="flex items-center justify-between gap-2 cursor-pointer">
                      <div className="font-medium text-sm truncate" title={app.name}>
                        {app.name}
                      </div>
                      <input
                        type="checkbox"
                        checked={access}
                        onChange={(e) => setAccess(app.slug, e.target.checked)}
                        disabled={saving || isProtected}
                        aria-label={t('ui.usersAdmin.modalCardAccess')}
                        className="h-4 w-4 rounded border-input text-primary focus:ring-2 focus:ring-ring"
                      />
                    </label>
                    <div className="text-xs text-muted-foreground">
                      {access
                        ? t('ui.usersAdmin.modalCardRoleLabel')
                        : t('ui.usersAdmin.statusNoAccess')}
                    </div>
                    {access && (
                      <Select
                        value={role}
                        onValueChange={(v) => setRole(app.slug, v)}
                        disabled={saving || app.roles.length === 0}
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue placeholder={t('ui.usersAdmin.pickRole')} />
                        </SelectTrigger>
                        <SelectContent>
                          {app.roles.map((r) => (
                            <SelectItem key={r.key} value={r.key}>
                              {r.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            {t('ui.usersAdmin.btnCancel')}
          </Button>
          <Button onClick={handleSave} disabled={saving || loadingCatalog}>
            {saving ? t('ui.usersAdmin.btnSaving') : t('ui.usersAdmin.btnSave')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
