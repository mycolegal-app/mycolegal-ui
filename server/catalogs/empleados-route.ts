/**
 * Factory: shared `GET /api/catalogs/empleados` for consumer apps.
 *
 * Returns the active `UserRole` rows of the caller's org so any client-side
 * form can populate an "empleado asignado" picker without requiring
 * `admin:users` (the admin-list endpoint is gated and non-admin roles get
 * 403, leaving the select silently empty — that's the bug this factory
 * prevents from spreading).
 *
 * Each app does:
 *   export const { GET } = createEmpleadosCatalogRoute({
 *     withOrgScope, withAuth, successResponse,
 *     parseSearchParams, getPaginationParams, buildPaginationMeta,
 *   });
 */

import { NextRequest } from 'next/server';
import type {
  CatalogRouteCtx,
  EmpleadosCatalogRouteDeps,
  CatalogPrisma,
} from './types';

export function createEmpleadosCatalogRoute(deps: EmpleadosCatalogRouteDeps) {
  const {
    prisma,
    withOrgScope,
    withAuth,
    successResponse,
    parseSearchParams,
    getPaginationParams,
    buildPaginationMeta,
  } = deps;

  const GET = withAuth(async (request: NextRequest, ctx: CatalogRouteCtx) => {
    const { auth } = ctx;
    const url = new URL(request.url);
    const sp = parseSearchParams(url);
    const { skip, take, page, pageSize } = getPaginationParams(sp);

    const db: CatalogPrisma = withOrgScope ? withOrgScope(auth.orgId) : prisma;

    const where: Record<string, unknown> = { active: true };
    if (sp.filters.search) {
      where.displayName = { contains: sp.filters.search, mode: 'insensitive' };
    }
    if (sp.filters.role) {
      where.role = sp.filters.role;
    }

    const [data, total] = await Promise.all([
      db.userRole.findMany({
        where,
        select: { id: true, displayName: true, email: true, role: true },
        orderBy: { displayName: 'asc' },
        skip,
        take,
      }),
      db.userRole.count({ where }),
    ]);

    return successResponse(data, buildPaginationMeta(total, { page, pageSize }));
  });

  return { GET };
}
