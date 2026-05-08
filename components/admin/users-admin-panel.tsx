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
import { Users, Lock, UserPlus, Trash2, Pencil } from 'lucide-react';

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
  }) {
    setInviteSubmitting(true);
    try {
      const res = await fetch(`${apiBase}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        toast({
          title: err.error?.message || t('ui.usersAdmin.toastInviteError'),
          variant: 'destructive',
        });
        return;
      }
      toast({ title: t('ui.usersAdmin.toastInviteSuccess'), variant: 'success' });
      setInviteOpen(false);
      fetchUsers();
    } catch (error) {
      console.error(error);
      toast({ title: t('ui.usersAdmin.toastInviteError'), variant: 'destructive' });
    } finally {
      setInviteSubmitting(false);
    }
  }

  async function handleDelete(user: UserRow, action: 'deactivate_app' | 'destroy') {
    setDeletingId(user.id);
    try {
      const res = await fetch(`${apiBase}/${user.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, authUserId: user.authUserId }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast({
          title: err.error?.message || t('ui.usersAdmin.toastDeleteError'),
          variant: 'destructive',
        });
        return;
      }
      toast({
        title:
          action === 'deactivate_app'
            ? t('ui.usersAdmin.toastDeactivatedFromApp', { app: appName })
            : t('ui.usersAdmin.toastDeletedFromOrg'),
        variant: 'success',
      });
      setDeleteUser(null);
      fetchUsers();
    } catch (error) {
      console.error(error);
      toast({ title: t('ui.usersAdmin.toastDeleteError'), variant: 'destructive' });
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
              className="h-7 px-2 text-xs"
              title={t('ui.usersAdmin.btnEdit')}
            >
              <Pencil className="h-3.5 w-3.5 mr-1" />
              {t('ui.usersAdmin.btnEdit')}
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
      />

      <Dialog
        open={!!deleteUser}
        onOpenChange={(open) => !open && setDeleteUser(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('ui.usersAdmin.deleteTitle')}</DialogTitle>
            <DialogDescription>
              {deleteUser?.displayName} ({deleteUser?.email})
            </DialogDescription>
          </DialogHeader>

          {deleteUser?.otherApps && deleteUser.otherApps.length > 0 ? (
            <>
              <p className="text-sm text-muted-foreground">
                {t('ui.usersAdmin.alsoHasAccess')}
              </p>
              <ul className="list-disc pl-5 text-sm">
                {deleteUser.otherApps.map((app) => (
                  <li key={app.slug} className="font-medium">
                    {app.name}
                  </li>
                ))}
              </ul>
              <DialogFooter className="flex-col sm:flex-row gap-2">
                <Button
                  variant="outline"
                  onClick={() => handleDelete(deleteUser, 'deactivate_app')}
                  disabled={!!deletingId}
                >
                  {deletingId ? '...' : t('ui.usersAdmin.deactivateInApp', { app: appName })}
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => handleDelete(deleteUser, 'destroy')}
                  disabled={!!deletingId}
                >
                  {deletingId ? '...' : t('ui.usersAdmin.deleteFromOrg')}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                {t('ui.usersAdmin.deleteWarning')}
              </p>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDeleteUser(null)}>
                  {t('ui.usersAdmin.btnCancel')}
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => handleDelete(deleteUser!, 'destroy')}
                  disabled={!!deletingId}
                >
                  {deletingId ? '...' : t('ui.usersAdmin.btnDelete')}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
