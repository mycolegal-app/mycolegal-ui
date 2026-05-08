"use client";

/**
 * Shared users admin panel — renders the entire "Usuarios" tab content
 * (table, search, invite dialog, role edit, activate/deactivate, delete).
 *
 * Each app embeds it inside its own `/admin` page tab structure:
 *
 *   <UsersAdminPanel
 *     appName="Notaría"
 *     assignableRoles={['OFICIAL', 'TRAMITADOR', 'CONSULTOR']}
 *     protectedRole="NOTARIO"
 *     orgAdminRoleHint="El rol Notario se asigna automáticamente al administrador de la organización."
 *   />
 */

import { useState, useEffect, useCallback } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Users, Lock, Pencil, UserPlus, Trash2, KeyRound } from 'lucide-react';

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { formatDateTime } from '../../lib/utils';
import { toast } from '../../hooks/use-toast';
import { roleLabel, roleColor } from './role-catalog';

export interface UserRow {
  id: string;
  authUserId: string;
  displayName: string;
  email: string;
  role: string | null;
  active: boolean;
  lastLoginAt: string | null;
  avatarUrl: string | null;
  authStatus?: string;
  /** Whether the user has UserAppPermission for the current app. */
  hasAppAccess?: boolean;
  otherApps?: Array<{ slug: string; name: string }>;
}

export interface UsersAdminPanelProps {
  /** Human-readable app name shown in the delete dialog ("Desactivar en <name>"). */
  appName: string;
  /** Roles selectable in the invite dialog and the inline role editor. */
  assignableRoles: readonly string[];
  /** Role that cannot be edited / deleted via this panel (lockout protection). Default: 'NOTARIO'. */
  protectedRole?: string;
  /** Hint shown next to the invite role selector. */
  orgAdminRoleHint?: string;
  /** Override the API base — defaults to "/api/admin/usuarios". */
  apiBase?: string;
  /** Slot at the top of the panel (e.g. extra filters). */
  toolbar?: React.ReactNode;
}

const STATUS_MAP: Record<
  string,
  { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }
> = {
  active: { label: 'Activo', variant: 'default' },
  invited: { label: 'Invitado', variant: 'outline' },
  pending_approval: { label: 'Pte. aprobación', variant: 'outline' },
  approved: { label: 'Aprobado', variant: 'outline' },
  suspended: { label: 'Suspendido', variant: 'destructive' },
  disabled: { label: 'Inactivo', variant: 'secondary' },
  denied: { label: 'Denegado', variant: 'destructive' },
};

export function UsersAdminPanel(props: UsersAdminPanelProps) {
  const { t } = useI18n();
  const {
    appName,
    assignableRoles,
    protectedRole = 'NOTARIO',
    orgAdminRoleHint,
    apiBase = '/api/admin/usuarios',
    toolbar,
  } = props;

  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [deleteUser, setDeleteUser] = useState<UserRow | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [grantingId, setGrantingId] = useState<string | null>(null);

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

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

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
          title: err.error?.message || 'Error al invitar usuario',
          variant: 'destructive',
        });
        return;
      }
      toast({ title: 'Usuario invitado. Se ha enviado un email de activación.', variant: 'success' });
      setInviteOpen(false);
      fetchUsers();
    } catch (error) {
      console.error(error);
      toast({ title: 'Error al invitar usuario', variant: 'destructive' });
    } finally {
      setInviteSubmitting(false);
    }
  }

  async function handleChangeRole(userRoleId: string, newRole: string) {
    setUpdatingId(userRoleId);
    try {
      const res = await fetch(`${apiBase}/${userRoleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast({ title: err.error?.message || 'Error al cambiar rol', variant: 'destructive' });
        return;
      }
      toast({ title: 'Rol actualizado', variant: 'success' });
      setEditingRoleId(null);
      fetchUsers();
    } catch (error) {
      console.error(error);
      toast({ title: 'Error al cambiar rol', variant: 'destructive' });
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleToggleActive(user: UserRow) {
    setUpdatingId(user.id);
    try {
      const res = await fetch(`${apiBase}/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !user.active }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast({
          title: err.error?.message || 'Error al actualizar estado',
          variant: 'destructive',
        });
        return;
      }
      toast({
        title: user.active ? 'Usuario desactivado' : 'Usuario activado',
        variant: 'success',
      });
      fetchUsers();
    } catch (error) {
      console.error(error);
      toast({ title: 'Error al actualizar estado', variant: 'destructive' });
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleGrantAccess(user: UserRow, role: string) {
    setUpdatingId(user.authUserId);
    try {
      const res = await fetch(apiBase, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          authUserId: user.authUserId,
          role,
          displayName: user.displayName,
          email: user.email,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast({
          title: err.error?.message || `Error al dar acceso a ${appName}`,
          variant: 'destructive',
        });
        return;
      }
      toast({ title: `Acceso a ${appName} concedido`, variant: 'success' });
      setGrantingId(null);
      fetchUsers();
    } catch (error) {
      console.error(error);
      toast({ title: `Error al dar acceso a ${appName}`, variant: 'destructive' });
    } finally {
      setUpdatingId(null);
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
          title: err.error?.message || 'Error al eliminar usuario',
          variant: 'destructive',
        });
        return;
      }
      toast({
        title:
          action === 'deactivate_app'
            ? `Usuario desactivado de ${appName}`
            : 'Usuario eliminado de la organización',
        variant: 'success',
      });
      setDeleteUser(null);
      fetchUsers();
    } catch (error) {
      console.error(error);
      toast({ title: 'Error al eliminar usuario', variant: 'destructive' });
    } finally {
      setDeletingId(null);
    }
  }

  const columns: ColumnDef<UserRow, unknown>[] = [
    {
      accessorKey: 'displayName',
      header: 'Nombre',
      cell: ({ row }) => {
        const u = row.original;
        return (
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
              {u.displayName
                .split(' ')
                .map((n) => n[0])
                .join('')
                .slice(0, 2)
                .toUpperCase()}
            </div>
            <span className="font-medium">{u.displayName}</span>
          </div>
        );
      },
    },
    {
      accessorKey: 'email',
      header: 'Email',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{row.original.email}</span>
      ),
    },
    {
      accessorKey: 'role',
      header: 'Rol',
      cell: ({ row }) => {
        const u = row.original;
        if (!u.hasAppAccess) {
          return <span className="text-sm text-muted-foreground">—</span>;
        }
        return (
          <div className="flex items-center gap-1.5">
            <Badge variant="outline" className={roleColor(u.role!)}>
              {roleLabel(u.role!)}
            </Badge>
            {u.role === protectedRole && (
              <span title={`El rol ${roleLabel(protectedRole)} se asigna automáticamente al administrador de la organización`}>
                <Lock className="h-3.5 w-3.5 text-muted-foreground" />
              </span>
            )}
          </div>
        );
      },
    },
    {
      id: 'apps',
      header: 'Apps activadas',
      enableSorting: false,
      cell: ({ row }) => {
        const u = row.original;
        const otherApps = u.otherApps ?? [];
        if (!u.hasAppAccess && otherApps.length === 0) {
          return <span className="text-sm text-muted-foreground">—</span>;
        }
        return (
          <div className="flex flex-wrap gap-1">
            {u.hasAppAccess && (
              <Badge variant="default" className="font-normal">
                {appName}
              </Badge>
            )}
            {otherApps.map((a) => (
              <Badge key={a.slug} variant="outline" className="font-normal text-muted-foreground">
                {a.name}
              </Badge>
            ))}
          </div>
        );
      },
    },
    {
      accessorKey: 'lastLoginAt',
      header: 'Último acceso',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.lastLoginAt ? formatDateTime(row.original.lastLoginAt) : 'Nunca'}
        </span>
      ),
    },
    {
      accessorKey: 'active',
      header: 'Estado',
      cell: ({ row }) => {
        const u = row.original;
        if (!u.hasAppAccess) {
          return (
            <Badge variant="secondary" title={`Este usuario no tiene acceso a ${appName}`}>
              Sin acceso
            </Badge>
          );
        }
        const status = u.authStatus || (u.active ? 'active' : 'disabled');
        const s = STATUS_MAP[status] || { label: status, variant: 'secondary' as const };
        return <Badge variant={s.variant}>{s.label}</Badge>;
      },
    },
    {
      id: 'acciones',
      header: 'Acciones',
      enableSorting: false,
      cell: ({ row }) => {
        const u = row.original;
        const isProtected = u.role === protectedRole;
        const isUpdating = updatingId === u.id || updatingId === u.authUserId;
        const isEditing = editingRoleId === u.id;
        const isGranting = grantingId === u.authUserId;

        if (!u.hasAppAccess) {
          if (isGranting) {
            return (
              <div className="flex items-center gap-2">
                <Select
                  defaultValue={assignableRoles[0]}
                  onValueChange={(value) => handleGrantAccess(u, value)}
                >
                  <SelectTrigger className="w-[160px] h-8">
                    <SelectValue placeholder="Selecciona rol..." />
                  </SelectTrigger>
                  <SelectContent>
                    {assignableRoles.map((r) => (
                      <SelectItem key={r} value={r}>
                        {roleLabel(r)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setGrantingId(null)}
                  disabled={isUpdating}
                  className="h-8 px-2"
                >
                  {t('ui.incidentThread.btnCancel')}
                </Button>
              </div>
            );
          }
          return (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setGrantingId(u.authUserId)}
              disabled={isUpdating}
              className="h-8"
            >
              <KeyRound className="h-3.5 w-3.5 mr-1.5" />
              {isUpdating ? '...' : `Dar acceso a ${appName}`}
            </Button>
          );
        }

        return (
          <div className="flex items-center gap-2">
            {isEditing ? (
              <Select
                defaultValue={u.role!}
                onValueChange={(value) => handleChangeRole(u.id, value)}
              >
                <SelectTrigger className="w-[140px] h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {assignableRoles.map((r) => (
                    <SelectItem key={r} value={r}>
                      {roleLabel(r)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditingRoleId(u.id)}
                disabled={isProtected || isUpdating}
                title={
                  isProtected
                    ? `El rol ${roleLabel(protectedRole)} no se puede cambiar`
                    : 'Cambiar rol'
                }
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleToggleActive(u)}
              disabled={isUpdating}
              className="h-8 px-2 text-muted-foreground hover:text-foreground"
            >
              {isUpdating ? '...' : u.active ? 'Desactivar' : 'Activar'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDeleteUser(u)}
              disabled={isProtected || isUpdating}
              title={
                isProtected
                  ? `No se puede eliminar al ${roleLabel(protectedRole)}`
                  : 'Eliminar usuario'
              }
              className="h-8 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" />
              Eliminar
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          {toolbar ?? <div />}
          <Button onClick={() => setInviteOpen(true)} size="sm">
            <UserPlus className="h-4 w-4 mr-1.5" />
            Invitar usuario
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <LoadingSpinner size="lg" />
          </div>
        ) : users.length === 0 ? (
          <EmptyState
            icon={Users}
            title={t("ui.usersAdmin.emptyTitle")}
            description={t("ui.usersAdmin.emptyDescription")}
          />
        ) : (
          <DataTable
            columns={columns}
            data={users}
            searchKey="displayName"
            searchPlaceholder={t("ui.usersAdmin.searchByName")}
            pageSize={20}
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

      <Dialog
        open={!!deleteUser}
        onOpenChange={(open) => !open && setDeleteUser(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("ui.usersAdmin.deleteTitle")}</DialogTitle>
            <DialogDescription>
              {deleteUser?.displayName} ({deleteUser?.email})
            </DialogDescription>
          </DialogHeader>

          {deleteUser?.otherApps && deleteUser.otherApps.length > 0 ? (
            <>
              <p className="text-sm text-muted-foreground">
                {t("ui.usersAdmin.alsoHasAccess")}
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
                  {deletingId ? '...' : t("ui.usersAdmin.deactivateInApp", { app: appName })}
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => handleDelete(deleteUser, 'destroy')}
                  disabled={!!deletingId}
                >
                  {deletingId ? '...' : t("ui.usersAdmin.deleteFromOrg")}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                {t("ui.usersAdmin.deleteWarning")}
              </p>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDeleteUser(null)}>
                  {t("ui.incidentThread.btnCancel")}
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => handleDelete(deleteUser!, 'destroy')}
                  disabled={!!deletingId}
                >
                  {deletingId ? '...' : t("ui.usersAdmin.btnDelete")}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
