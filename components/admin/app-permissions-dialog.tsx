"use client";

/**
 * Per-app fine-grained permissions dialog — opened from the (i) icon next
 * to each app card in `UserPermissionsModal`.
 *
 * Loads the per-app permission catalog and the user's current permissions
 * for that one app, then lets the operator:
 *   • pick a predefined role (auto-fills permissions),
 *   • toggle individual permissions on top of (or instead of) the role,
 *   • declare data-row scope restrictions (resource/attribute/op/values).
 *
 * Saves via PUT `${apiBase}/permissions/${authUserId}/app/${appSlug}`,
 * routed by `createUsuariosByIdAppPermRoute` to auth's
 * `/orgs/:orgId/users/:userId/permissions/:appSlug`.
 */

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, X } from 'lucide-react';

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
import { apiErrorMessage } from '../../lib/api-error';
import { toast } from '../../hooks/use-toast';
import type { UserRow } from './users-admin-panel';
import type { AppCatalogEntry } from './user-permissions-modal';
import { isLegacyHiddenRole } from './role-catalog';

interface PermissionCatalogEntry {
  key: string;
  label: string;
  description?: string | null;
  group?: string | null;
}

interface UserAppPermissionState {
  appRoleKey: string | null;
  permissions: string[];
  scopes: Array<{
    resource: string;
    attribute: string;
    operator: 'IN' | 'EQ' | 'NOT_IN';
    values: string[];
  }>;
}

export interface AppPermissionsDialogProps {
  open: boolean;
  user: UserRow | null;
  app: AppCatalogEntry | null;
  apiBase: string;
  onClose: () => void;
  onSaved: () => void;
}

export function AppPermissionsDialog({
  open,
  user,
  app,
  apiBase,
  onClose,
  onSaved,
}: AppPermissionsDialogProps) {
  const { t } = useI18n();

  const [permsCatalog, setPermsCatalog] = useState<PermissionCatalogEntry[]>([]);
  const [state, setState] = useState<UserAppPermissionState>({
    appRoleKey: null,
    permissions: [],
    scopes: [],
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const groupedPerms = useMemo(() => {
    const out: Record<string, PermissionCatalogEntry[]> = {};
    for (const p of permsCatalog) {
      const g = p.group || 'General';
      if (!out[g]) out[g] = [];
      out[g].push(p);
    }
    return out;
  }, [permsCatalog]);

  useEffect(() => {
    if (!open || !user || !app) return;
    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const [catalogRes, currentRes] = await Promise.all([
          fetch(`${apiBase}/apps-catalog/${app.slug}/permissions`),
          fetch(`${apiBase}/permissions/${user.authUserId}/app/${app.slug}`),
        ]);

        let catalog: PermissionCatalogEntry[] = [];
        if (catalogRes.ok) {
          const d = await catalogRes.json();
          catalog = d.data?.permissions ?? d.permissions ?? [];
        }

        let current: UserAppPermissionState = {
          appRoleKey: null,
          permissions: [],
          scopes: [],
        };
        if (currentRes.ok) {
          const d = await currentRes.json();
          // El factory devuelve { data: null } cuando el usuario aún no tiene
          // UserAppPermission para esta app. `??` no sirve aquí porque null
          // es nullish — usar `'data' in d` para distinguir "sin envoltorio"
          // de "envoltorio con null intencionado".
          const payload = d && typeof d === 'object' && 'data' in d ? d.data : d;
          if (payload && typeof payload === 'object') {
            current = {
              appRoleKey: payload.appRoleKey ?? null,
              permissions: payload.permissions ?? [],
              scopes: (payload.scopes ?? []).map((s: any) => ({
                resource: s.resource ?? '',
                attribute: s.attribute ?? '',
                operator: (s.operator ?? 'IN') as 'IN' | 'EQ' | 'NOT_IN',
                values: s.values ?? [],
              })),
            };
          }
        }

        if (!cancelled) {
          setPermsCatalog(catalog);
          setState(current);
        }
      } catch (err) {
        console.error('[AppPermissionsDialog] load error:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, user, app, apiBase]);

  // Radix Select doesn't allow empty-string item values (reserved for
  // "no selection"). We use a sentinel for the "no role / custom" entry
  // and translate to/from null at the boundary.
  const ROLE_NONE = '__none__';

  function setRole(roleKey: string) {
    if (!app) return;
    if (roleKey === ROLE_NONE) {
      setState((s) => ({ ...s, appRoleKey: null }));
      return;
    }
    const role = app.roles.find((r) => r.key === roleKey);
    setState((s) => ({
      ...s,
      appRoleKey: roleKey,
      // Auto-fill permissions from the role unless the user already
      // customized them — we replace to mirror the admin Permisos tab UX.
      permissions: role ? role.permissions : s.permissions,
    }));
  }

  function togglePermission(key: string) {
    setState((s) => {
      const has = s.permissions.includes(key);
      return {
        ...s,
        permissions: has
          ? s.permissions.filter((p) => p !== key)
          : [...s.permissions, key],
      };
    });
  }

  function addScope() {
    setState((s) => ({
      ...s,
      scopes: [...s.scopes, { resource: '', attribute: '', operator: 'IN', values: [] }],
    }));
  }

  function updateScope(idx: number, patch: Partial<UserAppPermissionState['scopes'][number]>) {
    setState((s) => ({
      ...s,
      scopes: s.scopes.map((sc, i) => (i === idx ? { ...sc, ...patch } : sc)),
    }));
  }

  function removeScope(idx: number) {
    setState((s) => ({
      ...s,
      scopes: s.scopes.filter((_, i) => i !== idx),
    }));
  }

  async function handleSave() {
    if (!user || !app) return;
    setSaving(true);
    try {
      const body = {
        appRoleKey: state.appRoleKey,
        permissions: state.permissions,
        scopes: state.scopes.filter(
          (s) => s.resource.trim() && s.attribute.trim() && s.values.length > 0,
        ),
      };
      const res = await fetch(`${apiBase}/permissions/${user.authUserId}/app/${app.slug}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast({
          title: apiErrorMessage(
            t,
            { status: res.status, code: err?.error?.code, message: err?.error?.message },
            t('ui.usersAdmin.toastPermsError'),
          ),
          variant: 'destructive',
        });
        return;
      }
      toast({ title: t('ui.usersAdmin.toastPermsSaved'), variant: 'success' });
      onSaved();
      onClose();
    } catch (err) {
      console.error(err);
      toast({
        title: apiErrorMessage(t, { code: 'NETWORK' }, t('ui.usersAdmin.toastPermsError')),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  }

  if (!user || !app) return null;

  const hasCatalog = permsCatalog.length > 0 || app.roles.length > 0;

  return (
    <Dialog open={open} onOpenChange={(v) => (!v && !saving ? onClose() : null)}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {t('ui.usersAdmin.permsDialogTitle', { name: user.displayName, app: app.name })}
          </DialogTitle>
          <DialogDescription>{t('ui.usersAdmin.permsDialogSubtitle')}</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            {t('ui.usersAdmin.permsDialogLoading')}
          </div>
        ) : !hasCatalog ? (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            {t('ui.usersAdmin.permsDialogNoCatalog')}
          </div>
        ) : (
          <div className="space-y-4 overflow-y-auto pr-1 -mr-1 flex-1 min-h-0">
            {/* Role selector */}
            {app.roles.length > 0 && (
              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                  {t('ui.usersAdmin.permsDialogRole')}
                </label>
                <Select
                  value={state.appRoleKey ?? ROLE_NONE}
                  onValueChange={setRole}
                  disabled={saving}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder={t('ui.usersAdmin.permsDialogRoleNone')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ROLE_NONE}>
                      {t('ui.usersAdmin.permsDialogRoleNone')}
                    </SelectItem>
                    {app.roles
                      .filter((r) => !isLegacyHiddenRole(r.key) || r.key === state.appRoleKey)
                      .map((r) => (
                      <SelectItem key={r.key} value={r.key}>
                        {r.label}
                        {r.isDefault ? ' · default' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Individual permissions */}
            {permsCatalog.length > 0 && (
              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  {t('ui.usersAdmin.permsDialogIndividual')}
                </label>
                <div className="space-y-3">
                  {Object.entries(groupedPerms).map(([group, perms]) => (
                    <div key={group}>
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                        {group}
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                        {perms.map((p) => {
                          const wildcard = state.permissions.includes('*');
                          const checked = state.permissions.includes(p.key) || wildcard;
                          return (
                            <label
                              key={p.key}
                              className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/40 rounded px-2 py-1"
                              title={p.description || ''}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={saving || (wildcard && p.key !== '*')}
                                onChange={() => togglePermission(p.key)}
                                className="h-4 w-4 rounded border-input text-primary focus:ring-2 focus:ring-ring"
                              />
                              <span className="truncate">{p.label}</span>
                              <span className="text-[10px] text-muted-foreground font-mono ml-auto">
                                {p.key}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Scopes */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {t('ui.usersAdmin.permsDialogScopes')}
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={addScope}
                  disabled={saving}
                  className="h-7 px-2 text-xs"
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  {t('ui.usersAdmin.permsDialogScopeAdd')}
                </Button>
              </div>
              {state.scopes.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  {t('ui.usersAdmin.permsDialogScopesEmpty')}
                </p>
              ) : (
                <div className="space-y-2">
                  {state.scopes.map((s, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                      <input
                        type="text"
                        placeholder={t('ui.usersAdmin.permsDialogScopeResource')}
                        value={s.resource}
                        onChange={(e) => updateScope(idx, { resource: e.target.value })}
                        disabled={saving}
                        className="col-span-3 rounded-md border border-input px-2 py-1 text-xs font-mono"
                      />
                      <input
                        type="text"
                        placeholder={t('ui.usersAdmin.permsDialogScopeAttribute')}
                        value={s.attribute}
                        onChange={(e) => updateScope(idx, { attribute: e.target.value })}
                        disabled={saving}
                        className="col-span-3 rounded-md border border-input px-2 py-1 text-xs font-mono"
                      />
                      <select
                        value={s.operator}
                        onChange={(e) =>
                          updateScope(idx, {
                            operator: e.target.value as 'IN' | 'EQ' | 'NOT_IN',
                          })
                        }
                        disabled={saving}
                        className="col-span-2 rounded-md border border-input px-2 py-1 text-xs"
                      >
                        <option value="IN">IN</option>
                        <option value="EQ">EQ</option>
                        <option value="NOT_IN">NOT_IN</option>
                      </select>
                      <input
                        type="text"
                        placeholder={t('ui.usersAdmin.permsDialogScopeValues')}
                        value={s.values.join(', ')}
                        onChange={(e) =>
                          updateScope(idx, {
                            values: e.target.value
                              .split(',')
                              .map((v) => v.trim())
                              .filter(Boolean),
                          })
                        }
                        disabled={saving}
                        className="col-span-3 rounded-md border border-input px-2 py-1 text-xs"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeScope(idx)}
                        disabled={saving}
                        className="col-span-1 h-7 px-1 text-destructive"
                        title={t('ui.usersAdmin.permsDialogScopeRemove')}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                  <p className="text-[11px] text-muted-foreground">
                    {t('ui.usersAdmin.permsDialogScopesHint')}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            {t('ui.usersAdmin.btnCancel')}
          </Button>
          <Button onClick={handleSave} disabled={saving || loading || !hasCatalog}>
            {saving
              ? t('ui.usersAdmin.permsDialogSaving')
              : t('ui.usersAdmin.permsDialogSave')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
