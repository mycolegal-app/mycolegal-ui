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
 *
 * Each app card has a Sliders icon that opens the AppPermissionsDialog
 * for fine-grained per-app permission tuning (role + individual perms +
 * data-row scopes). The icon stays visible only when the user has access
 * to the app (i.e. checkbox is on).
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Loader2,
  MailPlus,
  KeyRound,
  ShieldCheck,
  User,
  Ban,
  RotateCcw,
  Trash2,
  SlidersHorizontal,
} from 'lucide-react';

import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
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
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { useI18n } from '../i18n/i18n-context';
import { apiErrorMessage } from '../../lib/api-error';
import { toast } from '../../hooks/use-toast';
import type { UserRow } from './users-admin-panel';
import { AppPermissionsDialog } from './app-permissions-dialog';
import { UserAuditTimeline } from './user-audit-timeline';
import { isLegacyHiddenRole } from './role-catalog';

const LANGUAGE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'CAST', label: 'Castellano' },
  { value: 'CAT', label: 'Català' },
  { value: 'VAL', label: 'Valencià' },
  { value: 'GAL', label: 'Galego' },
  { value: 'EUS', label: 'Euskara' },
];

export interface AppCatalogEntry {
  slug: string;
  name: string;
  logoSvg?: string | null;
  roles: Array<{ key: string; label: string; isDefault: boolean; permissions: string[] }>;
}

interface PermissionCatalogEntry {
  key: string;
  label: string;
  description?: string | null;
  group?: string | null;
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
  /**
   * @deprecated v1.55.3 — sin efecto. Antes deshabilitaba el checkbox de la
   * app actual para impedir que el admin se quitara su propio acceso, pero
   * la restricción se aplicaba a todos los usuarios editados, lo que
   * impedía dar/quitar acceso a la propia app a cualquier otro miembro. El
   * backend ya protege contra "último org_admin"; el caso del admin que
   * se borra a sí mismo se asume.
   */
  protectedAppSlug?: string;
  onClose: () => void;
  onSaved: () => void;
  /** Called when the user clicks "Eliminar al usuario" — delegates the
   *  destructive flow (and its confirmation dialog) to the parent panel. */
  onDeleteClick?: (user: UserRow) => void;
  /** When true, expose the (i) Sliders icon per app card to open the
   *  AppPermissionsDialog. Defaults to true. */
  allowFineGrainedPerms?: boolean;
}

// Action button color tints — one shared palette so the toolbar reads as a
// single grouped section while still distinguishing each action.
const ACTION_BTN_BASE =
  'h-auto py-3 px-2 flex flex-col items-center justify-center gap-1.5 text-center whitespace-normal leading-tight';
const ACTION_TINT = {
  info: 'border-blue-300 text-blue-700 hover:bg-blue-50 hover:text-blue-800 dark:border-blue-900/60 dark:text-blue-300 dark:hover:bg-blue-950/40',
  promote:
    'border-violet-300 text-violet-700 hover:bg-violet-50 hover:text-violet-800 dark:border-violet-900/60 dark:text-violet-300 dark:hover:bg-violet-950/40',
  warn: 'border-amber-300 text-amber-700 hover:bg-amber-50 hover:text-amber-800 dark:border-amber-900/60 dark:text-amber-300 dark:hover:bg-amber-950/40',
  destructive:
    'border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive',
};

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
    allowFineGrainedPerms = true,
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
  const [resettingPassword, setResettingPassword] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [authBusy, setAuthBusy] = useState<null | 'role' | 'status'>(null);
  const [confirmSuspend, setConfirmSuspend] = useState(false);
  const [permsDialogApp, setPermsDialogApp] = useState<AppCatalogEntry | null>(null);
  const [activeTab, setActiveTab] = useState<'profile' | 'permissions' | 'audit'>('profile');
  const [profile, setProfile] = useState<{
    displayName: string;
    email: string;
    phoneNumber: string;
    language: string;
  }>({ displayName: '', email: '', phoneNumber: '', language: 'CAST' });
  const [savingProfile, setSavingProfile] = useState(false);
  // "¿Qué puede hacer este rol?" — desglose en claro de los permisos del rol
  // seleccionado por app (incidencia #78). El catálogo de permisos por app se
  // carga bajo demanda al expandir y se cachea por slug.
  const [roleInfoOpen, setRoleInfoOpen] = useState<Set<string>>(new Set());
  const [permCatalog, setPermCatalog] = useState<Record<string, PermissionCatalogEntry[]>>({});
  const [permCatalogLoading, setPermCatalogLoading] = useState<Set<string>>(new Set());

  function toggleRoleInfo(slug: string) {
    setRoleInfoOpen((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
    if (!permCatalog[slug] && !permCatalogLoading.has(slug)) {
      setPermCatalogLoading((prev) => new Set(prev).add(slug));
      fetch(`${apiBase}/apps-catalog/${slug}/permissions`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          const cat: PermissionCatalogEntry[] = d?.data?.permissions ?? d?.permissions ?? [];
          setPermCatalog((prev) => ({ ...prev, [slug]: cat }));
        })
        .catch(() => undefined)
        .finally(() =>
          setPermCatalogLoading((prev) => {
            const n = new Set(prev);
            n.delete(slug);
            return n;
          }),
        );
    }
  }

  useEffect(() => {
    if (open) {
      setPermissions(new Map(initialPermissions));
      setActiveTab('profile');
      if (user) {
        setProfile({
          displayName: user.displayName ?? '',
          email: user.email ?? '',
          phoneNumber: user.phoneNumber ?? '',
          language: user.language ?? 'CAST',
        });
      }
    }
  }, [open, initialPermissions, user]);

  function defaultRoleFor(slug: string): string {
    const app = apps.find((a) => a.slug === slug);
    if (!app || app.roles.length === 0) return '';
    // Preferir roles del catálogo unificado; los legacy migrados no se ofrecen
    // por defecto (#78). Si la app aún no tiene roles nuevos, caer a los que haya.
    const visible = app.roles.filter((r) => !isLegacyHiddenRole(r.key));
    const pool = visible.length ? visible : app.roles;
    return (pool.find((r) => r.isDefault) ?? pool[0]).key;
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
      // Sin diff no se llamaba a la API y se cerraba en silencio, lo que se
      // percibía como "Guardar no hace nada". Mostramos feedback y mantenemos
      // el modal abierto (igual que el tab de perfil) para que el admin pueda
      // hacer el cambio que pretendía.
      toast({ title: t('ui.usersAdmin.permsNoChanges') });
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
          title: apiErrorMessage(t, { status: res.status, code: err?.error?.code, message: err?.error?.message }, t('ui.usersAdmin.toastPermissionsError')),
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
          title: apiErrorMessage(t, { status: res.status, code: err?.error?.code, message: err?.error?.message }, t('ui.usersAdmin.toastResendInvitationError')),
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

  async function handleSendPasswordReset() {
    if (!user) return;
    setResettingPassword(true);
    try {
      const res = await fetch(
        `${apiBase}/permissions/${user.authUserId}/send-password-reset`,
        { method: 'POST' },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast({
          title: apiErrorMessage(t, { status: res.status, code: err?.error?.code, message: err?.error?.message }, t('ui.usersAdmin.toastPasswordResetError')),
          variant: 'destructive',
        });
        return;
      }
      toast({
        title: t('ui.usersAdmin.toastPasswordResetSent', { email: user.email }),
        variant: 'success',
      });
      setConfirmReset(false);
    } catch (error) {
      console.error(error);
      toast({
        title: t('ui.usersAdmin.toastPasswordResetError'),
        variant: 'destructive',
      });
    } finally {
      setResettingPassword(false);
    }
  }

  async function handleProfileSave() {
    if (!user) return;
    const patch: Record<string, unknown> = {};
    if (profile.displayName.trim() !== (user.displayName ?? '')) {
      patch.displayName = profile.displayName.trim();
    }
    if (profile.email.trim().toLowerCase() !== (user.email ?? '').toLowerCase()) {
      patch.email = profile.email.trim().toLowerCase();
    }
    const trimmedPhone = profile.phoneNumber.trim();
    if (trimmedPhone !== (user.phoneNumber ?? '')) {
      patch.phoneNumber = trimmedPhone === '' ? null : trimmedPhone;
    }
    if (profile.language !== (user.language ?? 'CAST')) {
      patch.language = profile.language;
    }
    if (Object.keys(patch).length === 0) {
      toast({ title: t('ui.usersAdmin.profileNoChanges') });
      return;
    }
    setSavingProfile(true);
    try {
      const res = await fetch(`${apiBase}/permissions/${user.authUserId}/profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast({
          title: apiErrorMessage(t, { status: res.status, code: err?.error?.code, message: err?.error?.message }, t('ui.usersAdmin.toastProfileError')),
          variant: 'destructive',
        });
        return;
      }
      toast({ title: t('ui.usersAdmin.toastProfileSaved'), variant: 'success' });
      onSaved();
    } catch (error) {
      console.error(error);
      toast({ title: t('ui.usersAdmin.toastProfileError'), variant: 'destructive' });
    } finally {
      setSavingProfile(false);
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
          title: apiErrorMessage(t, { status: res.status, code: err?.error?.code, message: err?.error?.message }, t('ui.usersAdmin.toastAuthChangeError')),
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
  const anyBusy =
    saving || resending || resettingPassword || savingProfile || authBusy !== null;

  async function togglePromote() {
    await patchAuthField(
      { authRole: isOrgAdmin ? 'user' : 'org_admin' },
      isOrgAdmin ? 'ui.usersAdmin.toastUserDemoted' : 'ui.usersAdmin.toastUserPromoted',
    );
  }

  async function toggleSuspend() {
    if (!isSuspended) {
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
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!v && !anyBusy) {
            setConfirmReset(false);
            setConfirmSuspend(false);
            onClose();
          }
        }}
      >
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 flex-wrap">
              <span>
                {t(
                  activeTab === 'profile'
                    ? 'ui.usersAdmin.modalTitleProfile'
                    : 'ui.usersAdmin.modalTitle',
                  { name: user.displayName },
                )}
              </span>
              {showOrgRole && !isSuperadmin && (
                <Badge
                  variant={isOrgAdmin ? 'default' : 'secondary'}
                  className={
                    isOrgAdmin
                      ? 'bg-violet-100 text-violet-800 hover:bg-violet-100 dark:bg-violet-950/40 dark:text-violet-200'
                      : ''
                  }
                >
                  {isOrgAdmin
                    ? t('ui.usersAdmin.badgeOrgAdmin')
                    : t('ui.usersAdmin.badgeOrgUser')}
                </Badge>
              )}
              {isSuperadmin && (
                <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-200">
                  superadmin
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription>
              {t(
                activeTab === 'profile'
                  ? 'ui.usersAdmin.modalSubtitleProfile'
                  : 'ui.usersAdmin.modalSubtitle',
              )}
            </DialogDescription>
          </DialogHeader>

          {/* Action toolbar — visually separated panel with vertical, equal-sized
              buttons and semantic tints. Labels wrap so longer translations
              ("Administratzaile gisa sustatu", "Promocionar a administrador")
              don't get truncated. */}
          <div className="rounded-lg border bg-muted/40 p-3">
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              {t('ui.usersAdmin.actionsPanelLabel')}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              <Button
                variant="outline"
                onClick={handleResendInvitation}
                disabled={!isInvited || anyBusy}
                title={
                  !isInvited
                    ? t('ui.usersAdmin.resendInvitationDisabledHint')
                    : undefined
                }
                className={`${ACTION_BTN_BASE} ${ACTION_TINT.info}`}
              >
                <MailPlus className="h-4 w-4" />
                <span className="text-xs">
                  {resending
                    ? t('ui.usersAdmin.btnResendingInvitation')
                    : t('ui.usersAdmin.btnResendInvitation')}
                </span>
              </Button>

              <Button
                variant="outline"
                onClick={() => setConfirmReset(true)}
                disabled={isInvited || isSuperadmin || anyBusy}
                title={
                  isInvited
                    ? t('ui.usersAdmin.sendPasswordResetDisabledHint')
                    : undefined
                }
                className={`${ACTION_BTN_BASE} ${ACTION_TINT.info}`}
              >
                <KeyRound className="h-4 w-4" />
                <span className="text-xs">
                  {resettingPassword
                    ? t('ui.usersAdmin.btnSendingPasswordReset')
                    : t('ui.usersAdmin.btnSendPasswordReset')}
                </span>
              </Button>

              {showOrgRole && (
                <Button
                  variant="outline"
                  onClick={togglePromote}
                  disabled={isSuperadmin || anyBusy}
                  className={`${ACTION_BTN_BASE} ${ACTION_TINT.promote}`}
                >
                  {isOrgAdmin ? <User className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
                  <span className="text-xs">
                    {isOrgAdmin
                      ? t('ui.usersAdmin.btnDemoteToUser')
                      : t('ui.usersAdmin.btnPromoteToAdmin')}
                  </span>
                </Button>
              )}

              <Button
                variant="outline"
                onClick={toggleSuspend}
                disabled={isSuperadmin || anyBusy}
                className={`${ACTION_BTN_BASE} ${ACTION_TINT.warn}`}
              >
                {isSuspended ? <RotateCcw className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
                <span className="text-xs">
                  {isSuspended
                    ? t('ui.usersAdmin.btnReactivate')
                    : t('ui.usersAdmin.btnSuspend')}
                </span>
              </Button>

              <Button
                variant="outline"
                onClick={handleDelete}
                disabled={isSuperadmin || anyBusy || !onDeleteClick}
                className={`${ACTION_BTN_BASE} ${ACTION_TINT.destructive}`}
              >
                <Trash2 className="h-4 w-4" />
                <span className="text-xs">{t('ui.usersAdmin.btnDeleteUser')}</span>
              </Button>
            </div>
          </div>

          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as 'profile' | 'permissions' | 'audit')}
            className="h-[420px] flex flex-col"
          >
            <TabsList className="self-start">
              <TabsTrigger value="permissions">
                {t('ui.usersAdmin.tabPermissions')}
              </TabsTrigger>
              <TabsTrigger value="profile">
                {t('ui.usersAdmin.tabProfile')}
              </TabsTrigger>
              <TabsTrigger value="audit">
                {t('ui.usersAdmin.tabAudit')}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="profile" className="mt-3 data-[state=inactive]:hidden">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-2">
                <div className="space-y-1">
                  <Label htmlFor="user-profile-name" className="text-xs">
                    {t('ui.usersAdmin.profileNameLabel')}
                  </Label>
                  <Input
                    id="user-profile-name"
                    className="h-8 text-sm"
                    value={profile.displayName}
                    onChange={(e) =>
                      setProfile((p) => ({ ...p, displayName: e.target.value }))
                    }
                    disabled={anyBusy}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="user-profile-email" className="text-xs">
                    {t('ui.usersAdmin.profileEmailLabel')}
                  </Label>
                  <Input
                    id="user-profile-email"
                    type="email"
                    className="h-8 text-sm"
                    value={profile.email}
                    onChange={(e) =>
                      setProfile((p) => ({ ...p, email: e.target.value }))
                    }
                    disabled={anyBusy}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="user-profile-phone" className="text-xs">
                    {t('ui.usersAdmin.profilePhoneLabel')}
                  </Label>
                  <Input
                    id="user-profile-phone"
                    type="tel"
                    className="h-8 text-sm"
                    placeholder={t('ui.usersAdmin.profilePhonePlaceholder')}
                    value={profile.phoneNumber}
                    onChange={(e) =>
                      setProfile((p) => ({ ...p, phoneNumber: e.target.value }))
                    }
                    disabled={anyBusy}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="user-profile-language" className="text-xs">
                    {t('ui.usersAdmin.profileLanguageLabel')}
                  </Label>
                  <Select
                    value={profile.language}
                    onValueChange={(v) => setProfile((p) => ({ ...p, language: v }))}
                    disabled={anyBusy}
                  >
                    <SelectTrigger id="user-profile-language" className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LANGUAGE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </TabsContent>

            <TabsContent
              value="permissions"
              className="flex-1 min-h-0 flex flex-col mt-3 space-y-2"
            >
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
                          disabled={anyBusy}
                          aria-label={t('ui.usersAdmin.modalCardAccess')}
                          className="h-4 w-4 rounded border-input text-primary focus:ring-2 focus:ring-ring shrink-0"
                        />
                      </label>
                      {access && (
                        <div className="flex items-center gap-1.5">
                          <Select
                            value={role}
                            onValueChange={(v) => setRole(app.slug, v)}
                            disabled={anyBusy || app.roles.length === 0}
                          >
                            <SelectTrigger className="h-7 text-xs px-2 [&>span]:truncate flex-1">
                              <SelectValue placeholder={t('ui.usersAdmin.pickRole')} />
                            </SelectTrigger>
                            <SelectContent>
                              {app.roles
                                .filter((r) => !isLegacyHiddenRole(r.key) || r.key === role)
                                .map((r) => (
                                <SelectItem key={r.key} value={r.key} className="text-xs">
                                  {r.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {allowFineGrainedPerms && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setPermsDialogApp(app)}
                              disabled={anyBusy}
                              title={t('ui.usersAdmin.btnCustomizePermsTip')}
                              aria-label={t('ui.usersAdmin.btnCustomizePerms')}
                              className="h-7 w-7 p-0 shrink-0 text-muted-foreground hover:text-foreground"
                            >
                              <SlidersHorizontal className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      )}
                      {access && (
                        <div>
                          <button
                            type="button"
                            onClick={() => toggleRoleInfo(app.slug)}
                            className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2"
                          >
                            {t('ui.usersAdmin.roleWhatItDoes')}
                          </button>
                          {roleInfoOpen.has(app.slug) && (
                            <RolePermsList
                              perms={app.roles.find((r) => r.key === role)?.permissions ?? []}
                              catalog={permCatalog[app.slug] ?? []}
                              loading={permCatalogLoading.has(app.slug)}
                              t={t}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            </TabsContent>

            <TabsContent
              value="audit"
              className="flex-1 min-h-0 flex flex-col mt-3 data-[state=inactive]:hidden"
            >
              {user && (
                <UserAuditTimeline
                  apiBase={apiBase}
                  authUserId={user.authUserId}
                  enabled={activeTab === 'audit'}
                />
              )}
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button variant="outline" onClick={onClose} disabled={anyBusy}>
              {activeTab === 'audit' ? t('ui.usersAdmin.btnClose') : t('ui.usersAdmin.btnCancel')}
            </Button>
            {activeTab !== 'audit' && (
              <Button
                onClick={activeTab === 'profile' ? handleProfileSave : handleSave}
                disabled={
                  anyBusy || (activeTab === 'permissions' && loadingCatalog)
                }
              >
                {(activeTab === 'profile' ? savingProfile : saving)
                  ? t('ui.usersAdmin.btnSaving')
                  : t('ui.usersAdmin.btnSave')}
              </Button>
            )}
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

      {/* Password reset confirm dialog */}
      <Dialog
        open={confirmReset}
        onOpenChange={(v) => !v && !resettingPassword && setConfirmReset(false)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('ui.usersAdmin.confirmPasswordResetTitle')}</DialogTitle>
            <DialogDescription>
              {t('ui.usersAdmin.confirmPasswordResetMsg', { email: user.email })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmReset(false)}
              disabled={resettingPassword}
            >
              {t('ui.usersAdmin.btnCancel')}
            </Button>
            <Button onClick={handleSendPasswordReset} disabled={resettingPassword}>
              {resettingPassword
                ? t('ui.usersAdmin.btnSendingPasswordReset')
                : t('ui.usersAdmin.btnSendResetEmail')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Per-app fine-grained permissions sub-dialog — opened via the (i)
          Sliders icon on each app card. */}
      <AppPermissionsDialog
        open={!!permsDialogApp}
        user={user}
        app={permsDialogApp}
        apiBase={apiBase}
        onClose={() => setPermsDialogApp(null)}
        onSaved={() => onSaved()}
      />
    </>
  );
}

/**
 * Desglose en claro de los permisos que otorga el rol seleccionado en una app
 * (incidencia #78: "¿dónde consulto qué permisos tiene cada rol?"). Traduce las
 * claves de permiso a sus etiquetas del catálogo de la app, agrupadas por grupo.
 */
function RolePermsList({
  perms,
  catalog,
  loading,
  t,
}: {
  perms: string[];
  catalog: PermissionCatalogEntry[];
  loading: boolean;
  t: (key: string) => string;
}) {
  if (loading) {
    return (
      <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        {t('ui.usersAdmin.roleLoadingPerms')}
      </p>
    );
  }
  if (perms.includes('*')) {
    return <p className="mt-1 text-[11px] text-muted-foreground">{t('ui.usersAdmin.roleFullAccess')}</p>;
  }
  if (perms.length === 0) {
    return <p className="mt-1 text-[11px] text-muted-foreground">{t('ui.usersAdmin.roleNoPerms')}</p>;
  }

  const byKey = new Map(catalog.map((c) => [c.key, c]));
  const groups = new Map<string, string[]>();
  for (const k of perms) {
    const def = byKey.get(k);
    const group = def?.group || 'General';
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group)!.push(def?.label || k);
  }

  return (
    <div className="mt-1 space-y-1">
      {[...groups.entries()].map(([group, labels]) => (
        <div key={group}>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{group}</p>
          <ul className="list-disc pl-4 text-[11px] text-muted-foreground">
            {labels.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
