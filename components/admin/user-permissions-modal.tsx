"use client";

/**
 * Cross-app permissions modal.
 *
 * Renders one same-size card per active app of the org plus a row of
 * direct-action buttons on top (resend invitation, promote/demote,
 * suspend/reactivate, delete). The user picks which apps the target user
 * can access and the role per app; on save, the diff against the initial
 * state is sent to `${apiBase}/permissions/{authUserId}` (PUT).
 *
 * Catalog (apps + roles) is fetched once from `${apiBase}/apps-catalog`
 * — passed in as a prop so the parent panel can cache it across rows.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Loader2,
  MailPlus,
  ShieldCheck,
  User,
  Ban,
  RotateCcw,
  Trash2,
} from 'lucide-react';

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
  logoSvg?: string | null;
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
  /** Show the org-level role action button (org_admin vs user). */
  showOrgRole?: boolean;
  /** Slug whose access cannot be removed (e.g., the app you're administering from). */
  protectedAppSlug?: string;
  onClose: () => void;
  onSaved: () => void;
  /** Called when the user clicks "Eliminar al usuario" — delegates the
   *  destructive flow (and its confirmation dialog) to the parent panel. */
  onDeleteClick?: (user: UserRow) => void;
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
    onDeleteClick,
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

  const [permissions, setPermissions] = useState<Map<string, string>>(initialPermissions);
  const [saving, setSaving] = useState(false);
  const [resending, setResending] = useState(false);
  const [authBusy, setAuthBusy] = useState<null | 'role' | 'status'>(null);
  const [confirmSuspend, setConfirmSuspend] = useState(false);

  // Reset state every time the modal opens for a different user.
  useEffect(() => {
    if (open) {
      setPermissions(new Map(initialPermissions));
    }
  }, [open, initialPermissions]);

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

    if (grants.length === 0 && removeApps.length === 0) {
      onClose();
      return;
    }

    const body: Record<string, unknown> = {
      apps: grants,
      removeApps,
      displayName: user.displayName,
      email: user.email,
    };

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

  async function handleResendInvitation() {
    if (!user) return;
    setResending(true);
    try {
      const res = await fetch(`${apiBase}/permissions/${user.authUserId}/resend-invitation`, {
        method: 'POST',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast({
          title: err.error?.message || t('ui.usersAdmin.toastResendInvitationError'),
          variant: 'destructive',
        });
        return;
      }
      toast({
        title: t('ui.usersAdmin.toastInvitationResent', { email: user.email }),
        variant: 'success',
      });
    } catch (error) {
      console.error(error);
      toast({
        title: t('ui.usersAdmin.toastResendInvitationError'),
        variant: 'destructive',
      });
    } finally {
      setResending(false);
    }
  }

  async function patchAuthField(
    body: { authRole?: 'org_admin' | 'user'; authStatus?: 'active' | 'suspended' | 'disabled' },
    successKey: string,
  ) {
    if (!user) return;
    setAuthBusy(body.authRole ? 'role' : 'status');
    try {
      const res = await fetch(`${apiBase}/permissions/${user.authUserId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, displayName: user.displayName, email: user.email }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast({
          title: err.error?.message || t('ui.usersAdmin.toastAuthChangeError'),
          variant: 'destructive',
        });
        return;
      }
      toast({ title: t(successKey), variant: 'success' });
      onSaved();
    } catch (error) {
      console.error(error);
      toast({ title: t('ui.usersAdmin.toastAuthChangeError'), variant: 'destructive' });
    } finally {
      setAuthBusy(null);
    }
  }

  if (!user) return null;

  const isInvited = user.authStatus === 'invited';
  const isOrgAdmin = user.authRole === 'org_admin';
  const isSuspended = user.authStatus === 'suspended';
  const isSuperadmin = user.authRole === 'superadmin';
  const anyBusy = saving || resending || authBusy !== null;

  async function togglePromote() {
    await patchAuthField(
      { authRole: isOrgAdmin ? 'user' : 'org_admin' },
      isOrgAdmin ? 'ui.usersAdmin.toastUserDemoted' : 'ui.usersAdmin.toastUserPromoted',
    );
  }

  async function toggleSuspend() {
    if (!isSuspended) {
      // Suspending is reversible but worth confirming.
      setConfirmSuspend(true);
      return;
    }
    await patchAuthField(
      { authStatus: 'active' },
      'ui.usersAdmin.toastUserReactivated',
    );
  }

  async function confirmSuspendNow() {
    setConfirmSuspend(false);
    await patchAuthField(
      { authStatus: 'suspended' },
      'ui.usersAdmin.toastUserSuspended',
    );
  }

  function handleDelete() {
    if (!user || !onDeleteClick) return;
    onDeleteClick(user);
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => (!v && !anyBusy ? onClose() : null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{t('ui.usersAdmin.modalTitle', { name: user.displayName })}</DialogTitle>
            <DialogDescription>{t('ui.usersAdmin.modalSubtitle')}</DialogDescription>
          </DialogHeader>

          {/* Action toolbar — equal-width buttons in a 4-column grid. Each
              button wraps its own state + permission semantics; disabled
              when the action is not applicable to the current user. */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleResendInvitation}
              disabled={!isInvited || anyBusy}
              title={!isInvited ? t('ui.usersAdmin.statusEnum.invited') : undefined}
              className="h-9 justify-center"
            >
              <MailPlus className="h-3.5 w-3.5 mr-1.5" />
              <span className="truncate">
                {resending
                  ? t('ui.usersAdmin.btnResendingInvitation')
                  : t('ui.usersAdmin.btnResendInvitation')}
              </span>
            </Button>

            {showOrgRole && (
              <Button
                variant="outline"
                size="sm"
                onClick={togglePromote}
                disabled={isSuperadmin || anyBusy}
                className="h-9 justify-center"
              >
                {isOrgAdmin ? (
                  <User className="h-3.5 w-3.5 mr-1.5" />
                ) : (
                  <ShieldCheck className="h-3.5 w-3.5 mr-1.5" />
                )}
                <span className="truncate">
                  {isOrgAdmin
                    ? t('ui.usersAdmin.btnDemoteToUser')
                    : t('ui.usersAdmin.btnPromoteToAdmin')}
                </span>
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={toggleSuspend}
              disabled={isSuperadmin || anyBusy}
              className="h-9 justify-center"
            >
              {isSuspended ? (
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              ) : (
                <Ban className="h-3.5 w-3.5 mr-1.5" />
              )}
              <span className="truncate">
                {isSuspended
                  ? t('ui.usersAdmin.btnReactivate')
                  : t('ui.usersAdmin.btnSuspend')}
              </span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleDelete}
              disabled={isSuperadmin || anyBusy || !onDeleteClick}
              className="h-9 justify-center text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              <span className="truncate">{t('ui.usersAdmin.btnDeleteUser')}</span>
            </Button>
          </div>

          <div className="space-y-2 min-h-0 flex-1 flex flex-col">
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
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 overflow-y-auto pr-1 -mr-1">
                {apps.map((app) => {
                  const access = permissions.has(app.slug);
                  const role = permissions.get(app.slug) ?? defaultRoleFor(app.slug);
                  const isProtected = app.slug === protectedAppSlug;
                  return (
                    <div
                      key={app.slug}
                      className="rounded-lg border p-2.5 flex flex-col gap-1.5"
                    >
                      <label className="flex items-center gap-2 cursor-pointer">
                        <div className="h-7 w-7 shrink-0 rounded-md border border-mc-neutral-200 bg-mc-neutral-50 flex items-center justify-center overflow-hidden">
                          {app.logoSvg ? (
                            <div
                              className="h-5 w-5 flex items-center justify-center [&_svg]:h-full [&_svg]:w-full"
                              dangerouslySetInnerHTML={{ __html: app.logoSvg }}
                            />
                          ) : (
                            <span className="text-[11px] font-semibold text-muted-foreground">
                              {app.name.charAt(0).toUpperCase()}
                            </span>
                          )}
                        </div>
                        <div className="font-medium text-sm truncate flex-1" title={app.name}>
                          {app.name}
                        </div>
                        <input
                          type="checkbox"
                          checked={access}
                          onChange={(e) => setAccess(app.slug, e.target.checked)}
                          disabled={anyBusy || isProtected}
                          aria-label={t('ui.usersAdmin.modalCardAccess')}
                          className="h-4 w-4 rounded border-input text-primary focus:ring-2 focus:ring-ring shrink-0"
                        />
                      </label>
                      {access && (
                        <Select
                          value={role}
                          onValueChange={(v) => setRole(app.slug, v)}
                          disabled={anyBusy || app.roles.length === 0}
                        >
                          <SelectTrigger className="h-7 text-xs px-2 [&>span]:truncate">
                            <SelectValue placeholder={t('ui.usersAdmin.pickRole')} />
                          </SelectTrigger>
                          <SelectContent>
                            {app.roles.map((r) => (
                              <SelectItem key={r.key} value={r.key} className="text-xs">
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
            <Button variant="outline" onClick={onClose} disabled={anyBusy}>
              {t('ui.usersAdmin.btnCancel')}
            </Button>
            <Button onClick={handleSave} disabled={anyBusy || loadingCatalog}>
              {saving ? t('ui.usersAdmin.btnSaving') : t('ui.usersAdmin.btnSave')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Suspend confirm dialog — kept inline so the action button can fire
          with one extra click without leaving the modal context. */}
      <Dialog open={confirmSuspend} onOpenChange={(v) => !v && setConfirmSuspend(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('ui.usersAdmin.confirmSuspendTitle')}</DialogTitle>
            <DialogDescription>{t('ui.usersAdmin.confirmSuspendMsg')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmSuspend(false)}>
              {t('ui.usersAdmin.btnCancel')}
            </Button>
            <Button variant="destructive" onClick={confirmSuspendNow} disabled={authBusy !== null}>
              {t('ui.usersAdmin.btnSuspend')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
