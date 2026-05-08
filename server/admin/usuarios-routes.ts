/**
 * Factory: shared CRUD for /api/admin/usuarios across consumer apps.
 *
 * Each app does:
 *   const deps = makeAdminDeps('<slug>', VALID_ROLES);
 *   export const { GET, POST } = createUsuariosRoutes(deps);
 *
 * Auth model:
 *   - Source of truth for users is `mycolegal-auth` (org-wide).
 *   - Each app keeps a local `UserRole` row (orgId + authUserId unique).
 *   - The list is reconciled on each GET via `/orgs/:id/sync/<slug>`; if
 *     auth is unreachable we fall back to local-only.
 */

import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import type { AdminAuth, UsuariosRoutesDeps } from './types';

type AdminCtx<P = Record<string, string>> = {
  params: Promise<P>;
  auth: AdminAuth;
};

type AuthUser = {
  id: string;
  email: string;
  displayName: string;
  role: string;
  status: string;
  lastLogin: string | null;
  appPermission: { appRoleKey: string; permissions: string[] } | null;
  otherApps: Array<{ slug: string; name: string }>;
};

function resolveOrgAdminRole(deps: UsuariosRoutesDeps): string {
  return deps.orgAdminRole ?? deps.validRoles[0];
}

function resolveProtectedRole(deps: UsuariosRoutesDeps): string | null {
  return deps.protectedRole === undefined ? resolveOrgAdminRole(deps) : deps.protectedRole;
}

// --------------------------------------------------------------------------
// /api/admin/usuarios — GET (list) + POST (assign role)
// --------------------------------------------------------------------------

export function createUsuariosRoutes(deps: UsuariosRoutesDeps) {
  const {
    appSlug,
    validRoles,
    prisma,
    withPermission,
    successResponse,
    errorResponse,
    fetchFromAuth,
    jwtCookieName,
    audit,
  } = deps;

  const GET = withPermission('admin:users')(async (_req: NextRequest, { auth }: AdminCtx) => {
    try {
      const cookieStore = await cookies();
      const token = cookieStore.get(jwtCookieName)?.value;
      if (!token) return errorResponse('UNAUTHORIZED', 'No token', 401);

      const syncRes = await fetchFromAuth(`/orgs/${auth.orgId}/sync/${appSlug}`, token);

      if (syncRes.status >= 400) {
        console.warn(`[admin/usuarios] auth sync failed (${appSlug}), fallback to local`);
        const localUsers = await prisma.userRole.findMany({
          where: { orgId: auth.orgId },
          orderBy: { displayName: 'asc' },
        });
        return successResponse(
          localUsers.map((u: any) => ({
            ...u,
            authStatus: u.active ? 'active' : 'disabled',
            hasAppAccess: true,
            otherApps: [],
          })),
        );
      }

      const syncData = syncRes.data?.data || syncRes.data;
      const authUsers: AuthUser[] = syncData?.users || [];

      const localUsers = await prisma.userRole.findMany({ where: { orgId: auth.orgId } });
      const localByAuthId = new Map<string, any>(localUsers.map((u: any) => [u.authUserId, u]));

      const result: any[] = [];
      for (const au of authUsers) {
        const local = localByAuthId.get(au.id);
        // Source of truth for "is in this app" is auth's UserAppPermission.
        // A local UserRole alone (orphan) does NOT count as access.
        const hasAppAccess = !!au.appPermission;
        if (local) {
          if (local.displayName !== au.displayName || local.email !== au.email) {
            await prisma.userRole
              .update({
                where: { id: local.id },
                data: { displayName: au.displayName, email: au.email },
              })
              .catch(() => {});
          }
          result.push({
            id: local.id,
            authUserId: au.id,
            displayName: au.displayName,
            email: au.email,
            role: hasAppAccess ? local.role : null,
            active: hasAppAccess ? local.active : false,
            lastLoginAt: local.lastLoginAt,
            avatarUrl: local.avatarUrl,
            authStatus: au.status,
            hasAppAccess,
            otherApps: au.otherApps,
          });
        } else {
          result.push({
            id: au.id,
            authUserId: au.id,
            displayName: au.displayName,
            email: au.email,
            role: hasAppAccess
              ? au.appPermission!.appRoleKey?.toUpperCase() || validRoles[1] || validRoles[0]
              : null,
            active: false,
            lastLoginAt: null,
            avatarUrl: null,
            authStatus: au.status,
            hasAppAccess,
            otherApps: au.otherApps,
          });
        }
      }
      return successResponse(result);
    } catch (error) {
      console.error('[admin/usuarios] GET error:', error);
      return errorResponse('INTERNAL_ERROR', 'Error al obtener usuarios', 500);
    }
  });

  const POST = withPermission('admin:users')(async (req: NextRequest, { auth }: AdminCtx) => {
    try {
      const body = (await req.json()) as {
        authUserId?: string;
        role?: string;
        displayName?: string;
        email?: string;
        authRole?: string;
      };
      const { authUserId, role, displayName, email } = body;

      if (!authUserId || !role || !displayName || !email) {
        return errorResponse(
          'VALIDATION_ERROR',
          'Los campos authUserId, role, displayName y email son obligatorios',
          422,
        );
      }
      if (!validRoles.includes(role)) {
        return errorResponse(
          'VALIDATION_ERROR',
          `Rol no válido. Roles permitidos: ${validRoles.join(', ')}`,
          422,
        );
      }

      const finalRole =
        body.authRole === 'org_admin' ? resolveOrgAdminRole(deps) : role;

      const userRole = await prisma.userRole.upsert({
        where: { authUserId_orgId: { authUserId, orgId: auth.orgId } },
        create: { authUserId, orgId: auth.orgId, role: finalRole, displayName, email, active: true },
        update: { role: finalRole, displayName, email },
      });

      const cookieStore = await cookies();
      const token = cookieStore.get(jwtCookieName)?.value;
      if (token) {
        await fetchFromAuth(
          `/orgs/${auth.orgId}/users/${authUserId}/permissions/${appSlug}`,
          token,
          { method: 'PUT', body: { appRoleKey: finalRole } },
        ).catch((err) => console.warn('[admin/usuarios] failed to sync role to auth:', err));
      }

      if (audit) {
        await audit({
          orgId: auth.orgId,
          userId: auth.userRoleId,
          accion: 'ASIGNAR_ROL',
          entidad: 'UserRole',
          entidadId: userRole.id,
          valorNuevo: { authUserId, role: finalRole, displayName, email },
        }).catch((err) => console.error('[admin/usuarios] audit error:', err));
      }

      return successResponse(userRole);
    } catch (error) {
      console.error('[admin/usuarios] POST error:', error);
      return errorResponse('INTERNAL_ERROR', 'Error al asignar rol', 500);
    }
  });

  return { GET, POST };
}

// --------------------------------------------------------------------------
// /api/admin/usuarios/[id] — PATCH (role / active) + DELETE (deactivate / destroy)
// --------------------------------------------------------------------------

export function createUsuariosByIdRoutes(deps: UsuariosRoutesDeps) {
  const {
    appSlug,
    validRoles,
    prisma,
    withPermission,
    successResponse,
    errorResponse,
    fetchFromAuth,
    jwtCookieName,
    audit,
  } = deps;
  const protectedRole = resolveProtectedRole(deps);

  const PATCH = withPermission('admin:users')(
    async (req: NextRequest, ctx: AdminCtx) => {
      try {
        const { id } = await ctx.params;
        const body = (await req.json()) as { role?: string; active?: boolean };
        const { role, active } = body;

        if (role !== undefined && !validRoles.includes(role)) {
          return errorResponse(
            'VALIDATION_ERROR',
            `Rol no válido. Roles permitidos: ${validRoles.join(', ')}`,
            422,
          );
        }

        const existing = await prisma.userRole.findUnique({ where: { id } });
        if (!existing || existing.orgId !== ctx.auth.orgId) {
          return errorResponse('NOT_FOUND', 'Usuario no encontrado', 404);
        }

        if (
          protectedRole &&
          existing.role === protectedRole &&
          role !== undefined &&
          role !== protectedRole
        ) {
          const count = await prisma.userRole.count({
            where: { orgId: ctx.auth.orgId, role: protectedRole, active: true },
          });
          if (count <= 1) {
            return errorResponse(
              'FORBIDDEN',
              `No se puede cambiar el rol del último ${protectedRole}.`,
              403,
            );
          }
        }

        const updateData: { role?: string; active?: boolean } = {};
        if (role !== undefined) updateData.role = role;
        if (active !== undefined) updateData.active = active;

        const updated = await prisma.userRole.update({ where: { id }, data: updateData });

        const cookieStore = await cookies();
        const token = cookieStore.get(jwtCookieName)?.value;
        if (token) {
          if (role !== undefined) {
            await fetchFromAuth(
              `/orgs/${ctx.auth.orgId}/users/${existing.authUserId}/permissions/${appSlug}`,
              token,
              { method: 'PUT', body: { appRoleKey: role } },
            ).catch((err) => console.warn('[admin/usuarios] sync role failed:', err));
          }
          if (active !== undefined) {
            await fetchFromAuth(
              `/orgs/${ctx.auth.orgId}/users/${existing.authUserId}`,
              token,
              { method: 'PATCH', body: { status: active ? 'active' : 'disabled' } },
            ).catch((err) => console.warn('[admin/usuarios] sync status failed:', err));
          }
        }

        if (audit) {
          await audit({
            orgId: ctx.auth.orgId,
            userId: ctx.auth.userRoleId,
            accion: 'MODIFICAR_USUARIO',
            entidad: 'UserRole',
            entidadId: id,
            valorAnterior: { role: existing.role, active: existing.active },
            valorNuevo: { role: updated.role, active: updated.active },
          }).catch((err) => console.error('[admin/usuarios] audit error:', err));
        }

        return successResponse(updated);
      } catch (error) {
        console.error('[admin/usuarios] PATCH error:', error);
        return errorResponse('INTERNAL_ERROR', 'Error al actualizar usuario', 500);
      }
    },
  );

  const DELETE = withPermission('admin:users')(
    async (req: NextRequest, ctx: AdminCtx) => {
      try {
        const { id } = await ctx.params;
        const body = (await req.json()) as {
          action: 'deactivate_app' | 'destroy';
          authUserId?: string;
        };
        const { action, authUserId: bodyAuthUserId } = body;

        if (!action || !['deactivate_app', 'destroy'].includes(action)) {
          return errorResponse(
            'VALIDATION_ERROR',
            'action debe ser "deactivate_app" o "destroy"',
            422,
          );
        }

        const existing = await prisma.userRole.findFirst({
          where: {
            orgId: ctx.auth.orgId,
            OR: [
              { id },
              { authUserId: id },
              ...(bodyAuthUserId ? [{ authUserId: bodyAuthUserId }] : []),
            ],
          },
        });
        const resolvedAuthUserId = existing?.authUserId || bodyAuthUserId || id;

        const cookieStore = await cookies();
        const token = cookieStore.get(jwtCookieName)?.value;
        if (!token) return errorResponse('UNAUTHORIZED', 'No token', 401);

        if (action === 'deactivate_app') {
          // 1) Quitar la permission de ESTA app en auth (fuente de verdad
          //    para hasAppAccess).
          await fetchFromAuth(
            `/orgs/${ctx.auth.orgId}/users/${resolvedAuthUserId}/permissions/${appSlug}`,
            token,
            { method: 'DELETE' },
          );

          // 2) Comprobar si al usuario le quedan otras apps en esta org. Si
          //    no le queda ninguna, desactivamos también el UserRole local
          //    (que es kill-switch org-wide: getAuthContext lo verifica).
          //    Si le quedan otras apps, NO tocamos UserRole.active — eso
          //    rompería las otras apps.
          //    NOTE (semántica C, fix v1.44.6): antes de este cambio, el
          //    handler ponía `active: false` incondicionalmente, lo que
          //    deshabilitaba al usuario en las otras apps de la misma org
          //    pese a tener UserAppPermission válida.
          let remainingApps = 0;
          let userRoleDeactivated = false;
          try {
            const permsRes = await fetchFromAuth(
              `/orgs/${ctx.auth.orgId}/users/${resolvedAuthUserId}/permissions`,
              token,
            );
            if (permsRes.status === 200) {
              const list = (permsRes.data as { data?: unknown[] })?.data;
              remainingApps = Array.isArray(list) ? list.length : 0;
            } else {
              // Best-effort: si no podemos contar (auth caído / 5xx), no
              // tocamos UserRole.active para evitar falso positivo.
              console.warn(
                `[admin/usuarios] no se pudo enumerar permissions restantes (${permsRes.status}) — no se tocará UserRole.active`,
              );
              remainingApps = -1;
            }
          } catch (err) {
            console.error('[admin/usuarios] error enumerando permissions restantes:', err);
            remainingApps = -1;
          }

          if (existing && remainingApps === 0) {
            await prisma.userRole.update({
              where: { id: existing.id },
              data: { active: false },
            });
            userRoleDeactivated = true;
          }

          if (audit) {
            await audit({
              orgId: ctx.auth.orgId,
              userId: ctx.auth.userRoleId,
              accion: 'DESACTIVAR_USUARIO_APP',
              entidad: 'UserRole',
              entidadId: existing?.id || resolvedAuthUserId,
              valorAnterior: { active: existing?.active ?? true },
              valorNuevo: {
                active: userRoleDeactivated ? false : (existing?.active ?? true),
                appsRemaining: remainingApps,
                userRoleDeactivated,
              },
            }).catch((err) => console.error('[admin/usuarios] audit error:', err));
          }

          return successResponse({
            action: 'deactivated',
            userId: resolvedAuthUserId,
            userRoleDeactivated,
            appsRemaining: remainingApps,
          });
        }

        const destroyRes = await fetchFromAuth(
          `/orgs/${ctx.auth.orgId}/users/${resolvedAuthUserId}/destroy`,
          token,
          { method: 'POST' },
        );
        if (destroyRes.status >= 400) {
          const msg =
            destroyRes.data?.error?.message ||
            destroyRes.data?.message ||
            'Error al eliminar usuario';
          return errorResponse('AUTH_ERROR', msg, destroyRes.status);
        }
        if (existing) {
          await prisma.userRole.delete({ where: { id: existing.id } });
        }
        if (audit) {
          await audit({
            orgId: ctx.auth.orgId,
            userId: ctx.auth.userRoleId,
            accion: 'ELIMINAR_USUARIO',
            entidad: 'UserRole',
            entidadId: existing?.id || resolvedAuthUserId,
            valorAnterior: existing ? { email: existing.email, role: existing.role } : null,
          }).catch((err) => console.error('[admin/usuarios] audit error:', err));
        }
        return successResponse({ action: 'destroyed', userId: resolvedAuthUserId });
      } catch (error) {
        console.error('[admin/usuarios] DELETE error:', error);
        return errorResponse('INTERNAL_ERROR', 'Error al eliminar usuario', 500);
      }
    },
  );

  return { PATCH, DELETE };
}

// --------------------------------------------------------------------------
// /api/admin/usuarios/invite — POST
// --------------------------------------------------------------------------

export function createUsuariosInviteRoute(deps: UsuariosRoutesDeps) {
  const {
    appSlug,
    validRoles,
    prisma,
    withPermission,
    successResponse,
    errorResponse,
    fetchFromAuth,
    jwtCookieName,
    audit,
  } = deps;

  const POST = withPermission('admin:users')(async (req: NextRequest, { auth }: AdminCtx) => {
    try {
      const body = (await req.json()) as {
        email?: string;
        displayName?: string;
        phoneNumber?: string;
        appRole?: string;
      };
      const { email, displayName, phoneNumber, appRole } = body;

      if (!email || !displayName || !appRole) {
        return errorResponse(
          'VALIDATION_ERROR',
          'Los campos email, displayName y appRole son obligatorios',
          422,
        );
      }
      if (!validRoles.includes(appRole)) {
        return errorResponse(
          'VALIDATION_ERROR',
          `Rol no válido. Roles permitidos: ${validRoles.join(', ')}`,
          422,
        );
      }

      const cookieStore = await cookies();
      const token = cookieStore.get(jwtCookieName)?.value;
      if (!token) return errorResponse('UNAUTHORIZED', 'No token', 401);

      const inviteRes = await fetchFromAuth(`/orgs/${auth.orgId}/users/invite`, token, {
        method: 'POST',
        body: {
          email,
          displayName,
          phoneNumber: phoneNumber || undefined,
          appSlugs: [appSlug],
        },
      });

      if (inviteRes.status >= 400) {
        // Auth's Fastify error shape: { error: "<msg>" } (string) | { error: { message } } | { message }.
        const data = inviteRes.data ?? {};
        const msg =
          data?.error?.message ||
          data?.message ||
          (typeof data?.error === 'string' ? data.error : null) ||
          'Error al invitar usuario';
        return errorResponse('AUTH_ERROR', msg, inviteRes.status);
      }

      const newUser = inviteRes.data?.user || inviteRes.data?.data || inviteRes.data;
      const authUserId = newUser?.id;
      if (!authUserId) {
        return errorResponse('AUTH_ERROR', 'No se recibió ID del usuario creado', 502);
      }

      // Override the default role assigned by auth with the requested one.
      const permRes = await fetchFromAuth(
        `/orgs/${auth.orgId}/users/${authUserId}/permissions/${appSlug}`,
        token,
        { method: 'PUT', body: { appRoleKey: appRole } },
      );
      if (permRes.status >= 400) {
        console.warn(`[admin/usuarios] failed to assign app role for ${authUserId}:`, permRes.data);
      }

      const userRole = await prisma.userRole.upsert({
        where: { authUserId_orgId: { authUserId, orgId: auth.orgId } },
        create: {
          authUserId,
          orgId: auth.orgId,
          role: appRole,
          displayName,
          email,
          active: true,
        },
        update: { role: appRole, displayName, email },
      });

      if (audit) {
        await audit({
          orgId: auth.orgId,
          userId: auth.userRoleId,
          accion: 'INVITAR_USUARIO',
          entidad: 'UserRole',
          entidadId: userRole.id,
          valorNuevo: { authUserId, email, role: appRole, displayName },
        }).catch((err) => console.error('[admin/usuarios] audit error:', err));
      }

      return successResponse({ ...userRole, authStatus: newUser.status });
    } catch (error) {
      console.error('[admin/usuarios] invite error:', error);
      return errorResponse('INTERNAL_ERROR', 'Error al invitar usuario', 500);
    }
  });

  return { POST };
}
