"use client";

/**
 * Shared users admin panel — renders the entire "Usuarios" tab content
 * (table, search, invite dialog, edit-permissions modal, delete).
 *
 * Embedded by each app's `/admin` page. Cross-app permissions edits go
 * through the shared modal: one card per app of the org plus an
 * org-level role toggle. Inline role editing has been retired in favour
 * of the modal — fewer affordances on the row, more comfort on the dialog.
 *
 *   <UsersAdminPanel
 *     appName="Notaría"
 *     appSlug="notaria"
 *     assignableRoles={['OFICIAL', 'TRAMITADOR', 'CONSULTOR']}
 *     protectedRole="NOTARIO"
 *   />
 */

import { useState, useEffect, useCallback } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Users, Lock, UserPlus, Trash2, Pencil, Ban, RotateCcw } from 'lucide-react';

import { DataTable } from '../shared/data-table';
import { LoadingSpinner } from '../shared/loading-spinner';
import { EmptyState } from '../shared/empty-state';
import { InviteUserDialog } from '../shared/invite-user-dialog';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { useI18n } from '../i18n/i18n-context';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { formatDateTime } from '../../lib/utils';
import { toast } from '../../hooks/use-toast';
import { roleLabel, roleColor } from './role-catalog';
import { UserPermissionsModal, type AppCatalogEntry } from './user-permissions-modal';

export interface UserRow {
  id: string;
  authUserId: string;
  displayName: string;
  email: string;
  /** Phone number from auth (null/undefined when user hasn't provided one). */
  phoneNumber?: string | null;
  /** Preferred language for system emails (CAST/CAT/VAL/GAL/EUS). */
  language?: string | null;
  /** App-level role for the current app, or null when hasAppAccess=false. */
  role: string | null;
  active: boolean;
  lastLoginAt: string | null;
  avatarUrl: string | null;
  authStatus?: string;
  /** Org-level role from auth (`org_admin` | `user` | `superadmin`). */
  authRole?: string;
  /** Whether the user has UserAppPermission for the current app. */
  hasAppAccess?: boolean;
  /** Other apps the user has UserAppPermission in (slug + name + role). */
  otherApps?: Array<{ slug: string; name: string; appRoleKey?: string }>;
}

export interface UsersAdminPanelProps {
  /** Human-readable app name. */
  appName: string;
  /**
   * App slug. Required for the cross-app permissions modal to seed the
   * initial state and to identify the "current app" card.
   */
  appSlug: string;
  /** Roles selectable in the invite dialog. The modal pulls roles per app from the catalog endpoint. */
  assignableRoles: readonly string[];
  /** Role that cannot be edited / deleted via this panel (lockout protection). */
  protectedRole?: string;
  /** Hint shown next to the invite role selector. */
  orgAdminRoleHint?: string;
  /** Override the API base — defaults to "/api/admin/usuarios". */
  apiBase?: string;
  /** Slot at the top of the panel (e.g. extra filters). */
  toolbar?: React.ReactNode;
  /** Whether the org-level role toggle (org_admin) appears in the modal. */
  showOrgRoleInModal?: boolean;
  /**
   * Whether the invite dialog exposes the "create with initial password"
   * mode in addition to the email-invite mode. Default: true. Apps can
   * pass `false` to limit invitations to the email flow.
   */
  allowInitialPasswordInvite?: boolean;
}

const STATUS_VARIANTS: Record<
  string,
  'default' | 'secondary' | 'outline' | 'destructive'
> = {
  active: 'default',
  invited: 'outline',
  pending_approval: 'outline',
  approved: 'outline',
  suspended: 'destructive',
  disabled: 'secondary',
  denied: 'destructive',
};

export function UsersAdminPanel(props: UsersAdminPanelProps) {
  const { t } = useI18n();
  const {
    appName,
    appSlug,
    assignableRoles,
    protectedRole = 'NOTARIO',
    orgAdminRoleHint,
    apiBase = '/api/admin/usuarios',
    toolbar,
    showOrgRoleInModal = true,
    allowInitialPasswordInvite = true,
  } = props;

  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [deleteUser, setDeleteUser] = useState<UserRow | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editUser, setEditUser] = useState<UserRow | null>(null);

  const [appsCatalog, setAppsCatalog] = useState<AppCatalogEntry[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);

  function statusLabel(status: string): string {
    return t(`ui.usersAdmin.statusEnum.${status}`);
  }

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(apiBase);
      if (res.ok) {
        const data = await res.json();
        setUsers(data.data || data);
      }
    } catch (err) {
      console.error('Error fetching users:', err);
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  const fetchCatalog = useCallback(async () => {
    setLoadingCatalog(true);
    try {
      const res = await fetch(`${apiBase}/apps-catalog`);
      if (res.ok) {
        const data = await res.json();
        const apps = data.data?.apps ?? data.apps ?? [];
        setAppsCatalog(apps);
      }
    } catch (err) {
      console.error('Error fetching apps catalog:', err);
    } finally {
      setLoadingCatalog(false);
    }
  }, [apiBase]);

  useEffect(() => {
    fetchUsers();
    fetchCatalog();
  }, [fetchUsers, fetchCatalog]);

  async function handleInvite(data: {
    email: string;
    displayName: string;
    phoneNumber?: string;
    appRole?: string;
    initialPassword?: string;
  }) {
    setInviteSubmitting(true);
    const withPassword = !!data.initialPassword;
    const endpoint = withPassword ? `${apiBase}/create-with-password` : `${apiBase}/invite`;
    const errorKey = withPassword ? 'ui.usersAdmin.toastInviteError' : 'ui.usersAdmin.toastInviteError';
    const successKey = withPassword
      ? 'ui.usersAdmin.toastUserCreatedWithPassword'
      : 'ui.usersAdmin.toastInviteSuccess';
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        toast({
          title: err.error?.message || t(errorKey),
          variant: 'destructive',
        });
        return;
      }
      toast({ title: t(successKey), variant: 'success' });
      setInviteOpen(false);
      fetchUsers();
    } catch (error) {
      console.error(error);
      toast({ title: t(errorKey), variant: 'destructive' });
    } finally {
      setInviteSubmitting(false);
    }
  }

  async function handleDestroy(user: UserRow) {
    setDeletingId(user.id);
    try {
      const res = await fetch(`${apiBase}/${user.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'destroy', authUserId: user.authUserId }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast({
          title: err.error?.message || t('ui.usersAdmin.toastDeleteError'),
          variant: 'destructive',
        });
        return;
      }
      toast({ title: t('ui.usersAdmin.toastDeletedFromOrg'), variant: 'success' });
      setDeleteUser(null);
      fetchUsers();
    } catch (error) {
      console.error(error);
      toast({ title: t('ui.usersAdmin.toastDeleteError'), variant: 'destructive' });
    } finally {
      setDeletingId(null);
    }
  }

  async function handleSuspendToggle(user: UserRow, nextStatus: 'active' | 'suspended') {
    setDeletingId(user.id);
    try {
      const res = await fetch(`${apiBase}/permissions/${user.authUserId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          authStatus: nextStatus,
          displayName: user.displayName,
          email: user.email,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast({
          title: err.error?.message || t('ui.usersAdmin.toastAuthChangeError'),
          variant: 'destructive',
        });
        return;
      }
      toast({
        title:
          nextStatus === 'suspended'
            ? t('ui.usersAdmin.toastUserSuspended')
            : t('ui.usersAdmin.toastUserReactivated'),
        variant: 'success',
      });
      setDeleteUser(null);
      fetchUsers();
    } catch (error) {
      console.error(error);
      toast({ title: t('ui.usersAdmin.toastAuthChangeError'), variant: 'destructive' });
    } finally {
      setDeletingId(null);
    }
  }

  const columns: ColumnDef<UserRow, unknown>[] = [
    {
      accessorKey: 'displayName',
      header: t('ui.usersAdmin.colName'),
      cell: ({ row }) => {
        const u = row.original;
        return (
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-[10px] font-medium shrink-0">
              {u.displayName
                .split(' ')
                .map((n) => n[0])
                .join('')
                .slice(0, 2)
                .toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="font-medium text-sm truncate">{u.displayName}</div>
              <div className="text-xs text-muted-foreground truncate">{u.email}</div>
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: 'role',
      header: t('ui.usersAdmin.colRole'),
      cell: ({ row }) => {
        const u = row.original;
        if (!u.hasAppAccess) {
          return <span className="text-xs text-muted-foreground">—</span>;
        }
        return (
          <div className="flex items-center gap-1">
            <Badge variant="outline" className={`${roleColor(u.role!)} text-xs px-1.5 py-0`}>
              {roleLabel(u.role!)}
            </Badge>
            {u.role === protectedRole && (
              <span title={t('ui.usersAdmin.protectedRoleHint', { role: roleLabel(protectedRole) })}>
                <Lock className="h-3 w-3 text-muted-foreground" />
              </span>
            )}
          </div>
        );
      },
    },
    {
      id: 'apps',
      header: t('ui.usersAdmin.colApps'),
      enableSorting: false,
      cell: ({ row }) => {
        const u = row.original;
        const otherApps = u.otherApps ?? [];
        if (!u.hasAppAccess && otherApps.length === 0) {
          return <span className="text-xs text-muted-foreground">—</span>;
        }
        const chipBase = 'inline-flex items-center justify-center rounded-md text-[10px] font-medium px-2 h-5 min-w-[4.5rem] max-w-[7rem] truncate';
        return (
          <div className="flex flex-wrap gap-1">
            {u.hasAppAccess && (
              <span
                className={`${chipBase} bg-primary text-primary-foreground`}
                title={appName}
              >
                {appName}
              </span>
            )}
            {otherApps.map((a) => (
              <span
                key={a.slug}
                className={`${chipBase} border bg-background text-muted-foreground`}
                title={a.appRoleKey ? `${a.name} · ${roleLabel(a.appRoleKey)}` : a.name}
              >
                {a.name}
              </span>
            ))}
          </div>
        );
      },
    },
    {
      accessorKey: 'lastLoginAt',
      header: t('ui.usersAdmin.colLastLogin'),
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {row.original.lastLoginAt ? formatDateTime(row.original.lastLoginAt) : t('ui.usersAdmin.never')}
        </span>
      ),
    },
    {
      accessorKey: 'active',
      header: t('ui.usersAdmin.colStatus'),
      cell: ({ row }) => {
        const u = row.original;
        if (!u.hasAppAccess) {
          return (
            <Badge
              variant="secondary"
              className="text-xs px-1.5 py-0"
              title={t('ui.usersAdmin.noAccessHint', { app: appName })}
            >
              {t('ui.usersAdmin.statusNoAccess')}
            </Badge>
          );
        }
        const status = u.authStatus || (u.active ? 'active' : 'disabled');
        const variant = STATUS_VARIANTS[status] ?? 'secondary';
        return <Badge variant={variant} className="text-xs px-1.5 py-0">{statusLabel(status)}</Badge>;
      },
    },
    {
      id: 'acciones',
      header: t('ui.usersAdmin.colActions'),
      enableSorting: false,
      cell: ({ row }) => {
        const u = row.original;
        const isProtected = u.role === protectedRole;
        return (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditUser(u)}
              className="h-7 w-7 p-0"
              title={t('ui.usersAdmin.btnEdit')}
              aria-label={t('ui.usersAdmin.btnEdit')}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDeleteUser(u)}
              disabled={isProtected}
              title={
                isProtected
                  ? t('ui.usersAdmin.protectedRoleDeleteHint', { role: roleLabel(protectedRole) })
                  : t('ui.usersAdmin.deleteUserTip')
              }
              className="h-7 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          {toolbar ?? <div />}
          <Button onClick={() => setInviteOpen(true)} size="sm">
            <UserPlus className="h-4 w-4 mr-1.5" />
            {t('ui.usersAdmin.btnInvite')}
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <LoadingSpinner size="lg" />
          </div>
        ) : users.length === 0 ? (
          <EmptyState
            icon={Users}
            title={t('ui.usersAdmin.emptyTitle')}
            description={t('ui.usersAdmin.emptyDescription')}
          />
        ) : (
          <DataTable
            columns={columns}
            data={users}
            searchKey="displayName"
            searchPlaceholder={t('ui.usersAdmin.searchByName')}
            pageSize={25}
            scrollable
          />
        )}
      </div>

      <InviteUserDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        onSubmit={handleInvite}
        roles={assignableRoles.map((r) => ({ value: r, label: roleLabel(r) }))}
        roleHint={orgAdminRoleHint}
        submitting={inviteSubmitting}
        allowInitialPassword={allowInitialPasswordInvite}
      />

      <UserPermissionsModal
        open={!!editUser}
        user={editUser}
        apps={appsCatalog}
        loadingCatalog={loadingCatalog}
        apiBase={apiBase}
        currentAppSlug={appSlug}
        showOrgRole={showOrgRoleInModal}
        protectedAppSlug={appSlug}
        onClose={() => setEditUser(null)}
        onSaved={() => {
          fetchUsers();
        }}
        onDeleteClick={(u) => {
          // Cierra el modal de permisos y abre el confirm de borrado
          // que ya gestiona el panel — un único punto para el flujo
          // destructivo (deactivate_app vs destroy según otherApps).
          setEditUser(null);
          setDeleteUser(u);
        }}
      />

      <Dialog
        open={!!deleteUser}
        onOpenChange={(open) => !open && !deletingId && setDeleteUser(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('ui.usersAdmin.trashDialogTitle')}</DialogTitle>
            <DialogDescription>
              {deleteUser?.displayName} ({deleteUser?.email})
            </DialogDescription>
          </DialogHeader>

          {deleteUser && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {t('ui.usersAdmin.trashDialogIntro', { name: deleteUser.displayName })}
              </p>
              {deleteUser.authStatus === 'suspended' ? (
                <button
                  type="button"
                  onClick={() => handleSuspendToggle(deleteUser, 'active')}
                  disabled={!!deletingId}
                  className="w-full text-left rounded-md border p-3 hover:bg-emerald-50 hover:border-emerald-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="flex items-start gap-2">
                    <RotateCcw className="h-4 w-4 mt-0.5 text-emerald-600 shrink-0" />
                    <div>
                      <div className="text-sm font-semibold">
                        {t('ui.usersAdmin.trashOptionReactivateTitle')}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {t('ui.usersAdmin.trashOptionReactivateDesc')}
                      </div>
                    </div>
                  </div>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleSuspendToggle(deleteUser, 'suspended')}
                  disabled={!!deletingId || deleteUser.authRole === 'superadmin'}
                  className="w-full text-left rounded-md border p-3 hover:bg-amber-50 hover:border-amber-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="flex items-start gap-2">
                    <Ban className="h-4 w-4 mt-0.5 text-amber-600 shrink-0" />
                    <div>
                      <div className="text-sm font-semibold">
                        {t('ui.usersAdmin.trashOptionSuspendTitle')}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {t('ui.usersAdmin.trashOptionSuspendDesc')}
                      </div>
                    </div>
                  </div>
                </button>
              )}
              <button
                type="button"
                onClick={() => handleDestroy(deleteUser)}
                disabled={!!deletingId || deleteUser.authRole === 'superadmin'}
                className="w-full text-left rounded-md border border-destructive/40 p-3 hover:bg-destructive/5 hover:border-destructive transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="flex items-start gap-2">
                  <Trash2 className="h-4 w-4 mt-0.5 text-destructive shrink-0" />
                  <div>
                    <div className="text-sm font-semibold text-destructive">
                      {t('ui.usersAdmin.trashOptionDeleteTitle')}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {t('ui.usersAdmin.trashOptionDeleteDesc')}
                    </div>
                  </div>
                </div>
              </button>
            </div>
          )}

          <DialogFooter className="sm:justify-center">
            <Button
              variant="outline"
              onClick={() => setDeleteUser(null)}
              disabled={!!deletingId}
            >
              {t('ui.usersAdmin.btnCancel')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
