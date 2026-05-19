/**
 * Shared types for catalog route factories.
 *
 * Kept loose so consumer apps can satisfy them via duck typing against their
 * own Prisma-generated types without cross-package coupling.
 */

import type { NextRequest, NextResponse } from 'next/server';

export type CatalogAuth = {
  orgId: string;
  userRoleId?: string;
  appRole?: string;
  permissions?: string[];
};

export type CatalogRouteCtx<P = Record<string, string>> = {
  params: Promise<P>;
  auth: CatalogAuth;
};

export type CatalogHandler<P = Record<string, string>> = (
  req: NextRequest,
  ctx: CatalogRouteCtx<P>,
) => Promise<NextResponse> | NextResponse;

export type CatalogNextHandler<P = Record<string, string>> = (
  req: NextRequest,
  ctx: { params: Promise<P> },
) => Promise<NextResponse>;

/**
 * Loose seam: each app's `withAuth` carries its own `AuthContext`. The factory
 * just expects something that accepts a handler and returns a Next route.
 */
export type WithAuthFn = (handler: any) => any;

/**
 * Loose seam: each app's `successResponse` has its own `PaginationMeta` type.
 * Using `any` for `meta` lets the consumer's stricter signature satisfy this
 * contract (a function that accepts `PaginationMeta` is NOT assignable to a
 * function that accepts `unknown` — parameter contravariance bites).
 */
export type SuccessFn = (data: any, meta?: any) => NextResponse;

/**
 * Minimal Prisma `userRole` table shape we touch. Returns are `any` because
 * each app may pass either a raw `PrismaClient` or one extended with
 * `$extends` (e.g. `withOrgScope`), and TS infers richer return types
 * (`Promise<number | {}>` for `count`) for the extended client. Keeping
 * the seam loose lets both satisfy the contract structurally.
 */
export interface UserRolePrismaTable {
  findMany(args?: any): Promise<any>;
  count(args?: any): Promise<any>;
}

export interface CatalogPrisma {
  userRole: UserRolePrismaTable;
}

export interface ParsedSearchParamsLike {
  page: number;
  pageSize: number;
  filters: Record<string, string>;
}

export interface PaginationParamsLike {
  skip: number;
  take: number;
  page: number;
  pageSize: number;
}

export type ParseSearchParamsFn = (url: URL) => any;
export type GetPaginationParamsFn = (sp: any) => any;
export type BuildPaginationMetaFn = (
  total: number,
  params: { page: number; pageSize: number },
) => any;

export interface EmpleadosCatalogRouteDeps {
  /** Org-scoped prisma client — must already filter `userRole.findMany` by org. */
  prisma: CatalogPrisma;
  /**
   * If `prisma` is NOT pre-scoped, pass a factory and we'll call it with `auth.orgId`
   * per-request. Prefer this for apps that use `withOrgScope(orgId)` pattern.
   */
  withOrgScope?: (orgId: string) => CatalogPrisma;
  withAuth: WithAuthFn;
  successResponse: SuccessFn;
  parseSearchParams: ParseSearchParamsFn;
  getPaginationParams: GetPaginationParamsFn;
  buildPaginationMeta: BuildPaginationMetaFn;
}
