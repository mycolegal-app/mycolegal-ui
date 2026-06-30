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
  phoneNumber?: string | null;
  language?: string | null;
  role: string;
  status: string;
  lastLogin: string | null;
  appPermission: { appRoleKey: string; permissions: string[] } | null;
  otherApps: Array<{ slug: string; name: string; appRoleKey?: string }>;
};

function resolveOrgAdminRole(deps: UsuariosRoutesDeps): string {
  return deps.orgAdminRole ?? deps.validRoles[0];
}

function resolveProtectedRole(deps: UsuariosRoutesDeps): string | null {
  return deps.protectedRole === undefined ? resolveOrgAdminRole(deps) : deps.protectedRole;
}

/**
 * Resolve the target orgId for the current request. Default: `auth.orgId`
 * from the JWT. Apps that browse foreign orgs (mycolegal-admin) override
 * `resolveOrgId` in their deps and pull it from URL params.
 */
function getTargetOrgId(
  deps: UsuariosRoutesDeps,
  auth: AdminAuth,
  params: Record<string, string>,
): string {
  return deps.resolveOrgId ? deps.resolveOrgId({ auth, params }) : auth.orgId;
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

  const GET = withPermission('admin:users')(async (_req: NextRequest, ctx: AdminCtx) => {
    try {
      const { auth } = ctx;
      const params = await ctx.params;
      const orgId = getTargetOrgId(deps, auth, params);
      const cookieStore = await cookies();
      const token = cookieStore.get(jwtCookieName)?.value;
      if (!token) return errorResponse('UNAUTHORIZED', 'No token', 401);

      const syncRes = await fetchFromAuth(`/orgs/${orgId}/sync/${appSlug}`, token);

      if (syncRes.status >= 400) {
        console.warn(`[admin/usuarios] auth sync failed (${appSlug}), fallback to local`);
        if (!prisma) {
          // No local DB to fall back to (e.g. mycolegal-admin) — surface
          // the auth error as-is so the UI can show a clear failure
          // instead of returning an empty list silently.
          const msg =
            syncRes.data?.error?.message || syncRes.data?.message || 'Sync failed';
          return errorResponse('AUTH_ERROR', msg, syncRes.status);
        }
        const localUsers = await prisma.userRole.findMany({
          where: { orgId },
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

      const localUsers = prisma
        ? await prisma.userRole.findMany({ where: { orgId } })
        : [];
      const localByAuthId = new Map<string, any>(localUsers.map((u: any) => [u.authUserId, u]));

      // Las consolas de plataforma (mycolegal-admin = superadmin; config =
      // configuración del org_admin) no son apps de usuario: todos los miembros
      // de la org son visibles y el "rol" mostrado es el rol org-level
      // (org_admin/user) — nadie tiene UserAppPermission[admin|config], pero eso
      // no debe pintarse como "No Access". Para apps de usuario (notaria, etc.)
      // hasAppAccess sigue derivándose de UserAppPermission.
      const isAdminApp = appSlug === 'admin' || appSlug === 'config';
      const result: any[] = [];
      for (const au of authUsers) {
        const local = localByAuthId.get(au.id);
        const hasAppAccess = isAdminApp ? true : !!au.appPermission;
        if (local) {
          if (prisma && (local.displayName !== au.displayName || local.email !== au.email)) {
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
            phoneNumber: au.phoneNumber ?? null,
            language: au.language ?? null,
            role: isAdminApp ? au.role : (hasAppAccess ? local.role : null),
            active: isAdminApp ? au.status === 'active' : (hasAppAccess ? local.active : false),
            // Admin general: último acceso a cualquier app (User.lastLogin en auth).
            // App admin: último acceso a ESTA app (UserRole.lastLoginAt local).
            lastLoginAt: isAdminApp ? au.lastLogin : local.lastLoginAt,
            avatarUrl: local.avatarUrl,
            authStatus: au.status,
            authRole: au.role,
            hasAppAccess,
            otherApps: au.otherApps,
          });
        } else {
          result.push({
            id: au.id,
            authUserId: au.id,
            displayName: au.displayName,
            email: au.email,
            phoneNumber: au.phoneNumber ?? null,
            language: au.language ?? null,
            role: isAdminApp
              ? au.role
              : (hasAppAccess
                ? au.appPermission!.appRoleKey?.toUpperCase() || validRoles[1] || validRoles[0]
                : null),
            active: isAdminApp ? au.status === 'active' : false,
            // En admin general no hay UserRole local (prisma=undefined), así que
            // siempre caemos aquí: el último acceso global lo da auth.
            lastLoginAt: isAdminApp ? au.lastLogin : null,
            avatarUrl: null,
            authStatus: au.status,
            authRole: au.role,
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

  const POST = withPermission('admin:users')(async (req: NextRequest, ctx: AdminCtx) => {
    try {
      const { auth } = ctx;
      const params = await ctx.params;
      const orgId = getTargetOrgId(deps, auth, params);
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

      const userRole = prisma
        ? await prisma.userRole.upsert({
            where: { authUserId_orgId: { authUserId, orgId } },
            create: { authUserId, orgId, role: finalRole, displayName, email, active: true },
            update: { role: finalRole, displayName, email },
          })
        : { id: authUserId, authUserId, orgId, role: finalRole, displayName, email, active: true };

      const cookieStore = await cookies();
      const token = cookieStore.get(jwtCookieName)?.value;
      if (token) {
        await fetchFromAuth(
          `/orgs/${orgId}/users/${authUserId}/permissions/${appSlug}`,
          token,
          { method: 'PUT', body: { appRoleKey: finalRole } },
        ).catch((err) => console.warn('[admin/usuarios] failed to sync role to auth:', err));
      }

      if (audit) {
        await audit({
          orgId,
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
        const params = await ctx.params;
        const orgId = getTargetOrgId(deps, ctx.auth, params);
        const { id } = params;
        const body = (await req.json()) as { role?: string; active?: boolean };
        const { role, active } = body;

        if (role !== undefined && !validRoles.includes(role)) {
          return errorResponse(
            'VALIDATION_ERROR',
            `Rol no válido. Roles permitidos: ${validRoles.join(', ')}`,
            422,
          );
        }

        // Without a local UserRole table the PATCH degenerates: there is
        // no row to mutate and no protected-role count to enforce. Apps
        // that want this behaviour (mycolegal-admin) can use the modal
        // PUT /permissions endpoint instead.
        if (!prisma) {
          return errorResponse(
            'NOT_IMPLEMENTED',
            'PATCH not supported without a local UserRole table',
            501,
          );
        }

        const existing = await prisma.userRole.findUnique({ where: { id } });
        if (!existing || existing.orgId !== orgId) {
          return errorResponse('NOT_FOUND', 'Usuario no encontrado', 404);
        }

        if (
          protectedRole &&
          existing.role === protectedRole &&
          role !== undefined &&
          role !== protectedRole
        ) {
          const count = await prisma.userRole.count({
            where: { orgId, role: protectedRole, active: true },
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
              `/orgs/${orgId}/users/${existing.authUserId}/permissions/${appSlug}`,
              token,
              { method: 'PUT', body: { appRoleKey: role } },
            ).catch((err) => console.warn('[admin/usuarios] sync role failed:', err));
          }
          if (active !== undefined) {
            await fetchFromAuth(
              `/orgs/${orgId}/users/${existing.authUserId}`,
              token,
              { method: 'PATCH', body: { status: active ? 'active' : 'disabled' } },
            ).catch((err) => console.warn('[admin/usuarios] sync status failed:', err));
          }
        }

        if (audit) {
          await audit({
            orgId,
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
        const params = await ctx.params;
        const orgId = getTargetOrgId(deps, ctx.auth, params);
        const { id } = params;
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

        const existing = prisma
          ? await prisma.userRole.findFirst({
              where: {
                orgId,
                OR: [
                  { id },
                  { authUserId: id },
                  ...(bodyAuthUserId ? [{ authUserId: bodyAuthUserId }] : []),
                ],
              },
            })
          : null;
        const resolvedAuthUserId = existing?.authUserId || bodyAuthUserId || id;

        const cookieStore = await cookies();
        const token = cookieStore.get(jwtCookieName)?.value;
        if (!token) return errorResponse('UNAUTHORIZED', 'No token', 401);

        if (action === 'deactivate_app') {
          // 1) Quitar la permission de ESTA app en auth (fuente de verdad
          //    para hasAppAccess).
          await fetchFromAuth(
            `/orgs/${orgId}/users/${resolvedAuthUserId}/permissions/${appSlug}`,
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
              `/orgs/${orgId}/users/${resolvedAuthUserId}/permissions`,
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

          if (prisma && existing && remainingApps === 0) {
            await prisma.userRole.update({
              where: { id: existing.id },
              data: { active: false },
            });
            userRoleDeactivated = true;
          }

          if (audit) {
            await audit({
              orgId,
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
          `/orgs/${orgId}/users/${resolvedAuthUserId}/destroy`,
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
        if (prisma && existing) {
          await prisma.userRole.delete({ where: { id: existing.id } });
        }
        if (audit) {
          await audit({
            orgId,
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

  const POST = withPermission('admin:users')(async (req: NextRequest, ctx: AdminCtx) => {
    try {
      const { auth } = ctx;
      const params = await ctx.params;
      const orgId = getTargetOrgId(deps, auth, params);
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

      const inviteRes = await fetchFromAuth(`/orgs/${orgId}/users/invite`, token, {
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
        `/orgs/${orgId}/users/${authUserId}/permissions/${appSlug}`,
        token,
        { method: 'PUT', body: { appRoleKey: appRole } },
      );
      if (permRes.status >= 400) {
        console.warn(`[admin/usuarios] failed to assign app role for ${authUserId}:`, permRes.data);
      }

      const userRole = prisma
        ? await prisma.userRole.upsert({
            where: { authUserId_orgId: { authUserId, orgId } },
            create: {
              authUserId,
              orgId,
              role: appRole,
              displayName,
              email,
              active: true,
            },
            update: { role: appRole, displayName, email },
          })
        : { id: authUserId, authUserId, orgId, role: appRole, displayName, email, active: true };

      if (audit) {
        await audit({
          orgId,
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

// --------------------------------------------------------------------------
// /api/admin/usuarios/apps-catalog — GET
// Returns the list of apps active in the org plus their assignable roles,
// so the cross-app permissions modal can render same-size cards with a
// role selector each. Pure passthrough to auth's /orgs/:orgId/apps-catalog.
// --------------------------------------------------------------------------

export function createUsuariosAppsCatalogRoute(deps: UsuariosRoutesDeps) {
  const { withPermission, successResponse, errorResponse, fetchFromAuth, jwtCookieName } = deps;

  const GET = withPermission('admin:users')(async (_req: NextRequest, ctx: AdminCtx) => {
    try {
      const params = await ctx.params;
      const orgId = getTargetOrgId(deps, ctx.auth, params);
      const cookieStore = await cookies();
      const token = cookieStore.get(jwtCookieName)?.value;
      if (!token) return errorResponse('UNAUTHORIZED', 'No token', 401);

      const res = await fetchFromAuth(`/orgs/${orgId}/apps-catalog`, token);
      if (res.status >= 400) {
        const msg = res.data?.error?.message || res.data?.message || 'Error al cargar catálogo';
        return errorResponse('AUTH_ERROR', msg, res.status);
      }
      const apps = res.data?.data?.apps || res.data?.apps || [];
      return successResponse({ apps });
    } catch (error) {
      console.error('[admin/usuarios/apps-catalog] GET error:', error);
      return errorResponse('INTERNAL_ERROR', 'Error al cargar catálogo', 500);
    }
  });

  return { GET };
}

// --------------------------------------------------------------------------
// /api/admin/usuarios/[authUserId]/permissions — PUT
// Cross-app permissions update used by the shared modal. Body:
//   {
//     apps: [{ slug, appRoleKey }],   // grant or change role
//     removeApps: string[],            // revoke
//     authRole?: 'org_admin' | 'user'  // optional org-level role change
//   }
// Each operation maps to one auth call. Local UserRole is only touched
// when the change concerns the *current* app's slug — other apps own their
// own provisioning on next login (see provisionUserRole in `auth-provision`).
// --------------------------------------------------------------------------

export function createUsuariosByIdPermissionsRoute(deps: UsuariosRoutesDeps) {
  const {
    appSlug,
    prisma,
    withPermission,
    successResponse,
    errorResponse,
    fetchFromAuth,
    jwtCookieName,
    audit,
  } = deps;

  const PUT = withPermission('admin:users')(
    async (req: NextRequest, ctx: AdminCtx<{ authUserId: string }>) => {
      try {
        const params = await ctx.params;
        const orgId = getTargetOrgId(deps, ctx.auth, params);
        const { authUserId } = params;
        const body = (await req.json()) as {
          apps?: Array<{ slug?: string; appRoleKey?: string }>;
          removeApps?: string[];
          authRole?: 'org_admin' | 'user' | null;
          authStatus?: 'active' | 'suspended' | 'disabled';
          displayName?: string;
          email?: string;
        };
        const { apps = [], removeApps = [], authRole, authStatus, displayName, email } = body;

        const cookieStore = await cookies();
        const token = cookieStore.get(jwtCookieName)?.value;
        if (!token) return errorResponse('UNAUTHORIZED', 'No token', 401);

        const errors: Array<{ slug?: string; status: number; message: string }> = [];

        // Org-level role first — keeps the door open even if a per-app
        // change later promotes/demotes the same user.
        if (authRole === 'org_admin' || authRole === 'user') {
          const r = await fetchFromAuth(
            `/orgs/${orgId}/users/${authUserId}`,
            token,
            { method: 'PATCH', body: { role: authRole } },
          );
          if (r.status >= 400) {
            errors.push({ status: r.status, message: r.data?.error?.message || r.data?.message || 'Error al cambiar rol org' });
          } else if (audit) {
            await audit({
              orgId,
              userId: ctx.auth.userRoleId,
              accion: 'MODIFICAR_ROL_ORG',
              entidad: 'User',
              entidadId: authUserId,
              valorNuevo: { role: authRole },
            }).catch(() => {});
          }
        }

        // Auth status (suspend / reactivate / disable). Mismo PATCH que role
        // — auth permite suspended | active | disabled vía updateUserSchema.
        if (authStatus === 'active' || authStatus === 'suspended' || authStatus === 'disabled') {
          const r = await fetchFromAuth(
            `/orgs/${orgId}/users/${authUserId}`,
            token,
            { method: 'PATCH', body: { status: authStatus } },
          );
          if (r.status >= 400) {
            errors.push({ status: r.status, message: r.data?.error?.message || r.data?.message || 'Error al cambiar estado del usuario' });
          } else if (audit) {
            await audit({
              orgId,
              userId: ctx.auth.userRoleId,
              accion: authStatus === 'suspended' ? 'SUSPENDER_USUARIO' : authStatus === 'active' ? 'REACTIVAR_USUARIO' : 'DESHABILITAR_USUARIO',
              entidad: 'User',
              entidadId: authUserId,
              valorNuevo: { status: authStatus },
            }).catch(() => {});
          }
        }

        // Grants / role updates per app.
        for (const a of apps) {
          if (!a.slug || !a.appRoleKey) continue;
          const r = await fetchFromAuth(
            `/orgs/${orgId}/users/${authUserId}/permissions/${a.slug}`,
            token,
            { method: 'PUT', body: { appRoleKey: a.appRoleKey } },
          );
          if (r.status >= 400) {
            errors.push({ slug: a.slug, status: r.status, message: r.data?.error?.message || r.data?.message || 'Error al asignar rol' });
            continue;
          }
          if (prisma && a.slug === appSlug && displayName && email) {
            // Sync local UserRole — keeps the per-app DB consistent so the
            // table re-renders without waiting for the next provision pass.
            await prisma.userRole
              .upsert({
                where: { authUserId_orgId: { authUserId, orgId } },
                create: {
                  authUserId,
                  orgId,
                  role: a.appRoleKey,
                  displayName,
                  email,
                  active: true,
                },
                update: { role: a.appRoleKey, displayName, email, active: true },
              })
              .catch((err: unknown) => console.warn('[admin/usuarios/permissions] local upsert failed:', err));
          }
          if (audit) {
            await audit({
              orgId,
              userId: ctx.auth.userRoleId,
              accion: 'ASIGNAR_ROL',
              entidad: 'UserAppPermission',
              entidadId: `${authUserId}:${a.slug}`,
              valorNuevo: { authUserId, appSlug: a.slug, appRoleKey: a.appRoleKey },
            }).catch(() => {});
          }
        }

        // Revokes.
        for (const slug of removeApps) {
          if (!slug) continue;
          const r = await fetchFromAuth(
            `/orgs/${orgId}/users/${authUserId}/permissions/${slug}`,
            token,
            { method: 'DELETE' },
          );
          if (r.status >= 400) {
            errors.push({ slug, status: r.status, message: r.data?.error?.message || r.data?.message || 'Error al revocar acceso' });
            continue;
          }
          if (prisma && slug === appSlug) {
            await prisma.userRole
              .updateMany({
                where: { authUserId, orgId },
                data: { active: false },
              })
              .catch((err: unknown) => console.warn('[admin/usuarios/permissions] local deactivate failed:', err));
          }
          if (audit) {
            await audit({
              orgId,
              userId: ctx.auth.userRoleId,
              accion: 'DESACTIVAR_USUARIO_APP',
              entidad: 'UserAppPermission',
              entidadId: `${authUserId}:${slug}`,
              valorAnterior: { active: true },
              valorNuevo: { active: false },
            }).catch(() => {});
          }
        }

        if (errors.length > 0) {
          return errorResponse(
            'PARTIAL_FAILURE',
            `Algunos cambios fallaron: ${errors.map((e) => `${e.slug ?? 'org'} (${e.status})`).join(', ')}`,
            errors.some((e) => e.status >= 500) ? 502 : 422,
          );
        }
        return successResponse({ updated: true });
      } catch (error) {
        console.error('[admin/usuarios/permissions] PUT error:', error);
        return errorResponse('INTERNAL_ERROR', 'Error al actualizar permisos', 500);
      }
    },
  );

  return { PUT };
}

// --------------------------------------------------------------------------
// /api/admin/usuarios/create-with-password — POST
//
// Alternative to the email invite: the admin sets the initial password
// directly. The user is forced onto /set-password on first login (auth
// flips `mustChangePassword=true` server-side). Same body validation as
// the email invite plus `initialPassword` (≥8 chars, matches auth's
// `createWithPasswordSchema`).
// --------------------------------------------------------------------------

export function createUsuariosCreateWithPasswordRoute(deps: UsuariosRoutesDeps) {
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

  const POST = withPermission('admin:users')(async (req: NextRequest, ctx: AdminCtx) => {
    try {
      const { auth } = ctx;
      const params = await ctx.params;
      const orgId = getTargetOrgId(deps, auth, params);
      const body = (await req.json()) as {
        email?: string;
        displayName?: string;
        initialPassword?: string;
        phoneNumber?: string;
        language?: string;
        appRole?: string;
      };
      const { email, displayName, initialPassword, phoneNumber, language, appRole } = body;

      if (!email || !displayName || !initialPassword || !appRole) {
        return errorResponse(
          'VALIDATION_ERROR',
          'Los campos email, displayName, initialPassword y appRole son obligatorios',
          422,
        );
      }
      if (initialPassword.length < 8) {
        return errorResponse('VALIDATION_ERROR', 'La contraseña debe tener al menos 8 caracteres', 422);
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

      const createRes = await fetchFromAuth(
        `/orgs/${orgId}/users/create-with-password`,
        token,
        {
          method: 'POST',
          body: {
            email,
            displayName,
            initialPassword,
            phoneNumber: phoneNumber || undefined,
            language: language || undefined,
            appSlugs: [appSlug],
          },
        },
      );

      if (createRes.status >= 400) {
        const data = createRes.data ?? {};
        const msg =
          data?.error?.message ||
          data?.message ||
          (typeof data?.error === 'string' ? data.error : null) ||
          'Error al crear usuario';
        return errorResponse('AUTH_ERROR', msg, createRes.status);
      }

      const newUser = createRes.data?.user || createRes.data?.data || createRes.data;
      const authUserId = newUser?.id;
      if (!authUserId) {
        return errorResponse('AUTH_ERROR', 'No se recibió ID del usuario creado', 502);
      }

      // Override the default role with the requested one (matches the
      // email-invite flow). Best-effort — auth already created the user.
      await fetchFromAuth(
        `/orgs/${orgId}/users/${authUserId}/permissions/${appSlug}`,
        token,
        { method: 'PUT', body: { appRoleKey: appRole } },
      ).catch((err) =>
        console.warn('[admin/usuarios/create-with-password] role assign failed:', err),
      );

      const userRole = prisma
        ? await prisma.userRole.upsert({
            where: { authUserId_orgId: { authUserId, orgId } },
            create: {
              authUserId,
              orgId,
              role: appRole,
              displayName,
              email,
              active: true,
            },
            update: { role: appRole, displayName, email },
          })
        : { id: authUserId, authUserId, orgId, role: appRole, displayName, email, active: true };

      if (audit) {
        await audit({
          orgId,
          userId: auth.userRoleId,
          accion: 'CREAR_USUARIO_CON_PASSWORD',
          entidad: 'UserRole',
          entidadId: userRole.id,
          valorNuevo: { authUserId, email, role: appRole, displayName },
        }).catch((err) => console.error('[admin/usuarios/create-with-password] audit error:', err));
      }

      return successResponse({ ...userRole, authStatus: newUser.status });
    } catch (error) {
      console.error('[admin/usuarios/create-with-password] POST error:', error);
      return errorResponse('INTERNAL_ERROR', 'Error al crear usuario', 500);
    }
  });

  return { POST };
}

// --------------------------------------------------------------------------
// /api/admin/usuarios/[authUserId]/resend-invitation — POST
//
// Used by the modal when the target user is still in `status='invited'`:
// invalidates every existing activation token and mints a fresh one,
// then resends the activation email. Auth-side guard (relaxed in
// mycolegal-auth@2.4.9) lets org_admin / admin:users do this — no longer
// superadmin-only.
// --------------------------------------------------------------------------

export function createUsuariosByIdResendInvitationRoute(deps: UsuariosRoutesDeps) {
  const { withPermission, successResponse, errorResponse, fetchFromAuth, jwtCookieName } = deps;

  const POST = withPermission('admin:users')(
    async (_req: NextRequest, ctx: AdminCtx<{ authUserId: string }>) => {
      try {
        const params = await ctx.params;
        const orgId = getTargetOrgId(deps, ctx.auth, params);
        const { authUserId } = params;

        const cookieStore = await cookies();
        const token = cookieStore.get(jwtCookieName)?.value;
        if (!token) return errorResponse('UNAUTHORIZED', 'No token', 401);

        const res = await fetchFromAuth(
          `/orgs/${orgId}/users/${authUserId}/resend-invitation`,
          token,
          { method: 'POST' },
        );
        if (res.status >= 400) {
          const msg =
            res.data?.error?.message ||
            res.data?.message ||
            'Error al reenviar invitación';
          return errorResponse('AUTH_ERROR', msg, res.status);
        }
        return successResponse(res.data?.data || res.data || { resent: true });
      } catch (error) {
        console.error('[admin/usuarios/resend-invitation] POST error:', error);
        return errorResponse('INTERNAL_ERROR', 'Error al reenviar invitación', 500);
      }
    },
  );

  return { POST };
}

// --------------------------------------------------------------------------
// /api/admin/usuarios/[authUserId]/app/[appSlug] — GET/PUT/DELETE
//
// Fine-grained per-app permissions: lets the cross-app modal's "(i) Sliders"
// open a sub-dialog that customizes role + individual permissions + data
// scopes for one user × one app. Same auth endpoints the admin Permisos tab
// uses, exposed under each consumer's apiBase so the shared dialog can run
// in any host app.
// --------------------------------------------------------------------------

export function createUsuariosByIdAppPermRoute(deps: UsuariosRoutesDeps) {
  const {
    withPermission,
    successResponse,
    errorResponse,
    fetchFromAuth,
    jwtCookieName,
    audit,
  } = deps;

  const GET = withPermission('admin:users')(
    async (_req: NextRequest, ctx: AdminCtx<{ authUserId: string; appSlug: string }>) => {
      try {
        const params = await ctx.params;
        const orgId = getTargetOrgId(deps, ctx.auth, params);
        const { authUserId, appSlug } = params;

        const cookieStore = await cookies();
        const token = cookieStore.get(jwtCookieName)?.value;
        if (!token) return errorResponse('UNAUTHORIZED', 'No token', 401);

        const res = await fetchFromAuth(
          `/orgs/${orgId}/users/${authUserId}/permissions/${appSlug}`,
          token,
        );
        if (res.status === 404) {
          // No UserAppPermission row yet — surface as null so the dialog can
          // start from a clean slate (default role suggested by the catalog).
          return successResponse(null);
        }
        if (res.status >= 400) {
          const msg = res.data?.error?.message || res.data?.message || 'Error al cargar permisos';
          return errorResponse('AUTH_ERROR', msg, res.status);
        }
        return successResponse(res.data?.data ?? res.data ?? null);
      } catch (error) {
        console.error('[admin/usuarios/app-perm] GET error:', error);
        return errorResponse('INTERNAL_ERROR', 'Error al cargar permisos', 500);
      }
    },
  );

  const PUT = withPermission('admin:users')(
    async (req: NextRequest, ctx: AdminCtx<{ authUserId: string; appSlug: string }>) => {
      try {
        const params = await ctx.params;
        const orgId = getTargetOrgId(deps, ctx.auth, params);
        const { authUserId, appSlug } = params;
        const body = (await req.json()) as {
          appRoleKey?: string | null;
          permissions?: string[];
          scopes?: Array<{ resource: string; attribute: string; operator: 'IN' | 'EQ' | 'NOT_IN'; values: string[] }>;
        };

        const cookieStore = await cookies();
        const token = cookieStore.get(jwtCookieName)?.value;
        if (!token) return errorResponse('UNAUTHORIZED', 'No token', 401);

        const res = await fetchFromAuth(
          `/orgs/${orgId}/users/${authUserId}/permissions/${appSlug}`,
          token,
          { method: 'PUT', body },
        );
        if (res.status >= 400) {
          const msg = res.data?.error?.message || res.data?.message || 'Error al guardar permisos';
          return errorResponse('AUTH_ERROR', msg, res.status);
        }
        if (audit) {
          await audit({
            orgId,
            userId: ctx.auth.userRoleId,
            accion: 'AJUSTAR_PERMISOS_APP',
            entidad: 'UserAppPermission',
            entidadId: `${authUserId}:${appSlug}`,
            valorNuevo: body,
          }).catch(() => {});
        }
        return successResponse(res.data?.data ?? res.data);
      } catch (error) {
        console.error('[admin/usuarios/app-perm] PUT error:', error);
        return errorResponse('INTERNAL_ERROR', 'Error al guardar permisos', 500);
      }
    },
  );

  const DELETE = withPermission('admin:users')(
    async (_req: NextRequest, ctx: AdminCtx<{ authUserId: string; appSlug: string }>) => {
      try {
        const params = await ctx.params;
        const orgId = getTargetOrgId(deps, ctx.auth, params);
        const { authUserId, appSlug } = params;

        const cookieStore = await cookies();
        const token = cookieStore.get(jwtCookieName)?.value;
        if (!token) return errorResponse('UNAUTHORIZED', 'No token', 401);

        const res = await fetchFromAuth(
          `/orgs/${orgId}/users/${authUserId}/permissions/${appSlug}`,
          token,
          { method: 'DELETE' },
        );
        if (res.status >= 400) {
          const msg = res.data?.error?.message || res.data?.message || 'Error al eliminar permisos';
          return errorResponse('AUTH_ERROR', msg, res.status);
        }
        if (audit) {
          await audit({
            orgId,
            userId: ctx.auth.userRoleId,
            accion: 'REVOCAR_PERMISOS_APP',
            entidad: 'UserAppPermission',
            entidadId: `${authUserId}:${appSlug}`,
          }).catch(() => {});
        }
        return successResponse({ removed: true });
      } catch (error) {
        console.error('[admin/usuarios/app-perm] DELETE error:', error);
        return errorResponse('INTERNAL_ERROR', 'Error al eliminar permisos', 500);
      }
    },
  );

  return { GET, PUT, DELETE };
}

// --------------------------------------------------------------------------
// /api/admin/usuarios/apps-catalog/[appSlug]/permissions — GET
//
// Permission catalog (declared individual permissions) for a given app, so
// the AppPermissionsDialog can render checkboxes grouped by `group`.
// Pure passthrough to auth's /apps/:slug/permissions.
// --------------------------------------------------------------------------

export function createUsuariosAppPermsCatalogRoute(deps: UsuariosRoutesDeps) {
  const { withPermission, successResponse, errorResponse, fetchFromAuth, jwtCookieName } = deps;

  const GET = withPermission('admin:users')(
    async (_req: NextRequest, ctx: AdminCtx<{ appSlug: string }>) => {
      try {
        const params = await ctx.params;
        const { appSlug } = params;
        // resolveOrgId might require it, but this is org-agnostic data.
        // We still call resolveOrgId to keep the auth gate consistent.
        getTargetOrgId(deps, ctx.auth, params);

        const cookieStore = await cookies();
        const token = cookieStore.get(jwtCookieName)?.value;
        if (!token) return errorResponse('UNAUTHORIZED', 'No token', 401);

        const res = await fetchFromAuth(`/apps/${appSlug}/permissions`, token);
        if (res.status >= 400) {
          const msg = res.data?.error?.message || res.data?.message || 'Error al cargar catálogo';
          return errorResponse('AUTH_ERROR', msg, res.status);
        }
        // Auth devuelve `{ data: AppPermission[] }` directo. fetchFromAuth ya
        // parsea JSON, así que res.data === { data: [...] }. Desempaquetamos
        // un nivel y normalizamos al shape `{ permissions: [...] }` que el
        // AppPermissionsDialog espera.
        const inner = (res.data as any)?.data;
        const perms = Array.isArray(inner)
          ? inner
          : Array.isArray(res.data)
            ? (res.data as any)
            : [];
        return successResponse({ permissions: perms });
      } catch (error) {
        console.error('[admin/usuarios/apps-catalog/permissions] GET error:', error);
        return errorResponse('INTERNAL_ERROR', 'Error al cargar catálogo', 500);
      }
    },
  );

  return { GET };
}

// --------------------------------------------------------------------------
// /api/admin/usuarios/[authUserId]/profile — PATCH
//
// Profile-only update (displayName / email / phoneNumber / language) for the
// "Editar perfil" tab in the cross-app permissions modal. Forwards to auth's
// PATCH /orgs/:orgId/users/:userId — auth enforces email uniqueness. Local
// UserRole (the per-app shadow row) is kept in sync so the panel doesn't
// have to wait for the next provisioning pass to reflect the new name/email.
// --------------------------------------------------------------------------

export function createUsuariosByIdProfileRoute(deps: UsuariosRoutesDeps) {
  const {
    appSlug,
    prisma,
    withPermission,
    successResponse,
    errorResponse,
    fetchFromAuth,
    jwtCookieName,
    audit,
  } = deps;

  const PATCH = withPermission('admin:users')(
    async (req: NextRequest, ctx: AdminCtx<{ authUserId: string }>) => {
      try {
        const params = await ctx.params;
        const orgId = getTargetOrgId(deps, ctx.auth, params);
        const { authUserId } = params;
        const body = (await req.json()) as {
          displayName?: string;
          email?: string;
          phoneNumber?: string | null;
          language?: string;
        };
        const { displayName, email, phoneNumber, language } = body;

        if (
          displayName === undefined &&
          email === undefined &&
          phoneNumber === undefined &&
          language === undefined
        ) {
          return errorResponse('VALIDATION_ERROR', 'No hay cambios para guardar', 422);
        }

        const cookieStore = await cookies();
        const token = cookieStore.get(jwtCookieName)?.value;
        if (!token) return errorResponse('UNAUTHORIZED', 'No token', 401);

        const patchBody: Record<string, unknown> = {};
        if (displayName !== undefined) patchBody.displayName = displayName;
        if (email !== undefined) patchBody.email = email;
        if (phoneNumber !== undefined) patchBody.phoneNumber = phoneNumber;
        if (language !== undefined) patchBody.language = language;

        const res = await fetchFromAuth(
          `/orgs/${orgId}/users/${authUserId}`,
          token,
          { method: 'PATCH', body: patchBody },
        );
        if (res.status >= 400) {
          const msg =
            res.data?.error?.message ||
            res.data?.message ||
            (typeof res.data?.error === 'string' ? res.data.error : null) ||
            'Error al actualizar perfil';
          return errorResponse('AUTH_ERROR', msg, res.status);
        }

        if (prisma && (displayName !== undefined || email !== undefined)) {
          await prisma.userRole
            .updateMany({
              where: { authUserId, orgId },
              data: {
                ...(displayName !== undefined ? { displayName } : {}),
                ...(email !== undefined ? { email } : {}),
              },
            })
            .catch((err: unknown) =>
              console.warn('[admin/usuarios/profile] local sync failed:', err),
            );
        }

        if (audit) {
          await audit({
            orgId,
            userId: ctx.auth.userRoleId,
            accion: 'EDITAR_PERFIL_USUARIO',
            entidad: 'User',
            entidadId: authUserId,
            valorNuevo: patchBody,
          }).catch(() => {});
        }

        return successResponse(res.data?.data ?? res.data ?? { updated: true });
      } catch (error) {
        console.error('[admin/usuarios/profile] PATCH error:', error);
        return errorResponse('INTERNAL_ERROR', 'Error al actualizar perfil', 500);
      }
    },
  );

  return { PATCH };
}

// --------------------------------------------------------------------------
// /api/admin/usuarios/[authUserId]/send-password-reset — POST
//
// Admin-driven password reset: pure passthrough to auth. The user receives
// the same one-time link as the self-service "Olvidé mi contraseña" flow.
// Distinct from `resend-invitation`, which targets users that never logged
// in for the first time.
// --------------------------------------------------------------------------

export function createUsuariosByIdSendPasswordResetRoute(deps: UsuariosRoutesDeps) {
  const {
    withPermission,
    successResponse,
    errorResponse,
    fetchFromAuth,
    jwtCookieName,
    audit,
  } = deps;

  const POST = withPermission('admin:users')(
    async (_req: NextRequest, ctx: AdminCtx<{ authUserId: string }>) => {
      try {
        const params = await ctx.params;
        const orgId = getTargetOrgId(deps, ctx.auth, params);
        const { authUserId } = params;

        const cookieStore = await cookies();
        const token = cookieStore.get(jwtCookieName)?.value;
        if (!token) return errorResponse('UNAUTHORIZED', 'No token', 401);

        const res = await fetchFromAuth(
          `/orgs/${orgId}/users/${authUserId}/send-password-reset`,
          token,
          { method: 'POST' },
        );
        if (res.status >= 400) {
          const msg =
            res.data?.error?.message ||
            res.data?.message ||
            'Error al enviar el email de restablecimiento';
          return errorResponse('AUTH_ERROR', msg, res.status);
        }

        if (audit) {
          await audit({
            orgId,
            userId: ctx.auth.userRoleId,
            accion: 'ENVIAR_RESET_CONTRASENA',
            entidad: 'User',
            entidadId: authUserId,
          }).catch(() => {});
        }

        return successResponse(res.data?.data || res.data || { sent: true });
      } catch (error) {
        console.error('[admin/usuarios/send-password-reset] POST error:', error);
        return errorResponse('INTERNAL_ERROR', 'Error al enviar el email de restablecimiento', 500);
      }
    },
  );

  return { POST };
}

// --------------------------------------------------------------------------
// /api/admin/usuarios/[authUserId]/audit — GET timeline (AuditLog + mail)
// --------------------------------------------------------------------------

export function createUsuariosByIdAuditRoute(deps: UsuariosRoutesDeps) {
  const {
    withPermission,
    successResponse,
    errorResponse,
    fetchFromAuth,
    jwtCookieName,
  } = deps;

  const GET = withPermission('admin:users')(
    async (req: NextRequest, ctx: AdminCtx<{ authUserId: string }>) => {
      try {
        const params = await ctx.params;
        const orgId = getTargetOrgId(deps, ctx.auth, params);
        const { authUserId } = params;

        const cookieStore = await cookies();
        const token = cookieStore.get(jwtCookieName)?.value;
        if (!token) return errorResponse('UNAUTHORIZED', 'No token', 401);

        const url = new URL(req.url);
        const qp = new URLSearchParams();
        for (const key of ['limit', 'category', 'appSlug', 'sinceMs', 'untilMs']) {
          const v = url.searchParams.get(key);
          if (v) qp.set(key, v);
        }
        const qs = qp.toString();

        const res = await fetchFromAuth(
          `/orgs/${orgId}/users/${authUserId}/timeline${qs ? `?${qs}` : ''}`,
          token,
        );
        if (res.status >= 400) {
          const msg =
            res.data?.error?.message ||
            res.data?.message ||
            'Error al obtener la auditoría del usuario';
          return errorResponse('AUTH_ERROR', msg, res.status);
        }

        return successResponse(res.data?.data ?? res.data ?? { data: [] });
      } catch (error) {
        console.error('[admin/usuarios/audit] GET error:', error);
        return errorResponse('INTERNAL_ERROR', 'Error al obtener la auditoría', 500);
      }
    },
  );

  return { GET };
}
