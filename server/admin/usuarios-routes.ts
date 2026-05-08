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

      const result: any[] = [];
      for (const au of authUsers) {
        const local = localByAuthId.get(au.id);
        // Source of truth for "is in this app" is auth's UserAppPermission.
        // A local UserRole alone (orphan) does NOT count as access.
        const hasAppAccess = !!au.appPermission;
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
            role: hasAppAccess ? local.role : null,
            active: hasAppAccess ? local.active : false,
            lastLoginAt: local.lastLoginAt,
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
            role: hasAppAccess
              ? au.appPermission!.appRoleKey?.toUpperCase() || validRoles[1] || validRoles[0]
              : null,
            active: false,
            lastLoginAt: null,
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
          displayName?: string;
          email?: string;
        };
        const { apps = [], removeApps = [], authRole, displayName, email } = body;

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
