/**
 * Shared admin types — kept tiny so consumer apps can satisfy them with
 * their own Prisma-generated types via duck typing (no per-app coupling).
 */

import type { NextRequest, NextResponse } from 'next/server';

export type AdminAuth = {
  orgId: string;
  userRoleId?: string;
  appRole?: string;
  permissions?: string[];
};

export type AdminRouteCtx<P = Record<string, string>> = {
  params: Promise<P>;
  auth: AdminAuth;
};

export type AdminHandler<P = Record<string, string>> = (
  req: NextRequest,
  ctx: AdminRouteCtx<P>,
) => Promise<NextResponse> | NextResponse;

export type AdminNextHandler<P = Record<string, string>> = (
  req: NextRequest,
  ctx: { params: Promise<P> },
) => Promise<NextResponse>;

/**
 * Loose type — each app's `withPermission` carries its own `AuthContext`
 * (richer than `AdminAuth`), so the seam uses `any` and the factory casts
 * on entry. Consumer apps just pass their existing `withPermission`.
 */
export type WithPermissionFn = (permission: string) => (handler: any) => any;

export type SuccessFn = <T>(data: T) => NextResponse;
export type ErrorFn = (code: string, message: string, status?: number) => NextResponse;

export type FetchFromAuthFn = (
  path: string,
  token: string,
  options?: { method?: string; body?: unknown },
) => Promise<{ status: number; data: any }>;

/**
 * Minimal Prisma `userRole` shape we touch. Each app's generated client
 * satisfies this structurally — no need to share types across packages.
 */
export interface UserRolePrismaTable {
  findMany(args?: any): Promise<any[]>;
  findUnique(args: any): Promise<any | null>;
  findFirst(args: any): Promise<any | null>;
  upsert(args: any): Promise<any>;
  update(args: any): Promise<any>;
  updateMany(args: any): Promise<{ count: number }>;
  delete(args: any): Promise<any>;
  count(args?: any): Promise<number>;
}

export interface AdminPrisma {
  userRole: UserRolePrismaTable;
}

export type AuditEvent = {
  orgId: string;
  userId?: string;
  accion: string;
  entidad: string;
  entidadId: string;
  valorAnterior?: unknown;
  valorNuevo?: unknown;
};

export type AuditFn = (event: AuditEvent) => Promise<void>;

export interface UsuariosRoutesDeps {
  /** App slug used in auth service paths (e.g. 'notaria', 'legifirma', 'tributos'). */
  appSlug: string;
  /** App-level AppRole values that admins may assign in this app. */
  validRoles: readonly string[];
  /** Role assigned automatically when the auth user has authRole === 'org_admin'. Default: first validRole. */
  orgAdminRole?: string;
  /**
   * Role that must always have ≥1 active member (lockout prevention).
   * Default: same as `orgAdminRole`. Pass `null` to disable the check.
   */
  protectedRole?: string | null;
  /**
   * Local UserRole table for app-side caching/reconciliation.
   * Apps without their own DB (mycolegal-admin) pass `undefined` and the
   * factory skips local upserts/lookups.
   */
  prisma?: AdminPrisma | null;
  withPermission: WithPermissionFn;
  successResponse: SuccessFn;
  errorResponse: ErrorFn;
  fetchFromAuth: FetchFromAuthFn;
  jwtCookieName: string;
  /**
   * Per-request override for the target orgId. Default: use `auth.orgId`
   * from the JWT. Admin tools that browse other orgs (mycolegal-admin's
   * `/organizations/[id]/...`) pass a function that pulls the id from URL
   * params, so the factory still scopes queries correctly.
   */
  resolveOrgId?: (ctx: { auth: AdminAuth; params: Record<string, string> }) => string;
  /** Optional audit log hook (legifirma uses it; notaria currently doesn't). */
  audit?: AuditFn;
}
