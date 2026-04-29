import type { PrismaClient } from '@prisma/client';
import { buildScopeWhere, type ScopeContext } from './scopes';

/**
 * Tenant context wrapper for Row-Level Security (RLS).
 *
 * Wraps a Prisma operation in a transaction that first sets the
 * Postgres session variable `app.current_org`. Tables with RLS
 * policies (see `mycolegal-platform/prisma/migrations/*_rls_*`) read
 * this var to filter rows belonging to the current tenant.
 *
 * **Usage from a consumer app**:
 *
 *   // src/lib/rls.ts
 *   import { createRlsHelpers } from '@mycolegal-app/ui/server/rls';
 *   import { prisma } from './db';
 *   export const { withOrgContext, withoutOrgContext } = createRlsHelpers(prisma);
 *
 *   // Then in a handler:
 *   const peticion = await withOrgContext(auth.orgId, (tx) =>
 *     tx.archivoPeticion.findUnique({ where: { id } })
 *   );
 *
 * **Why a transaction**: `SET LOCAL` only takes effect inside a
 * transaction and is automatically reset at COMMIT/ROLLBACK. Safe
 * with connection pools (Cloud SQL Auth Proxy, Prisma's pool,
 * PgBouncer in transaction mode): the setting never leaks to
 * another request reusing the same connection.
 *
 * **Why a factory**: each consumer app instantiates its own typed
 * `PrismaClient` (with its slim Prisma schema). The factory takes
 * that client and returns helpers bound to it.
 */

const ORG_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export function createRlsHelpers<TPrisma extends PrismaClient>(client: TPrisma) {
  type Tx = Parameters<Parameters<TPrisma['$transaction']>[0]>[0];

  /**
   * Run `fn` inside a transaction with `app.current_org` set to `orgId`.
   * RLS policies will scope queries to that org.
   */
  async function withOrgContext<T>(
    orgId: string,
    fn: (tx: Tx) => Promise<T>,
  ): Promise<T> {
    if (typeof orgId !== 'string' || orgId.length === 0) {
      throw new Error('withOrgContext: orgId must be a non-empty string');
    }
    if (!ORG_ID_PATTERN.test(orgId)) {
      throw new Error(`withOrgContext: orgId contains invalid characters: ${orgId}`);
    }
    return client.$transaction(async (tx: Tx) => {
      // SET LOCAL is reset at COMMIT/ROLLBACK → safe with connection pools.
      await (tx as unknown as { $executeRawUnsafe: (q: string) => Promise<number> })
        .$executeRawUnsafe(`SET LOCAL app.current_org = '${orgId}'`);
      return fn(tx);
    });
  }

  /**
   * Marker for queries that must NOT be scoped (cross-org dashboards
   * for superadmin). Today it just passes the client through; in the
   * future this can switch to a dedicated `prismaAdmin` pool with
   * `BYPASSRLS` user.
   */
  async function withoutOrgContext<T>(fn: (c: TPrisma) => Promise<T>): Promise<T> {
    return fn(client);
  }

  /**
   * Like `withOrgContext`, plus exposes a `scoped(resource)` helper that
   * returns the Prisma `where` fragment enforcing `ctx.scopes` for the
   * given resource. Call sites merge the fragment into their own filters:
   *
   *   await withScopedContext(ctx, async (tx, scoped) => {
   *     return tx.archivoPeticion.findMany({
   *       where: { ...userWhere, ...(scoped('ArchivoPeticion') ?? {}) },
   *     });
   *   });
   *
   * The helper returns `null` when no scope applies, so spread-with-empty
   * is the idiomatic pattern. For writes, callers should additionally
   * call `assertScopeAllows` from `./scopes` before persisting.
   *
   * `ctx.appKey` and `ctx.manifest` are app-specific and live in the
   * consumer app's `src/lib/scopes.ts` (see Phase 3 adoption guide).
   */
  async function withScopedContext<T>(
    orgId: string,
    ctx: ScopeContext,
    fn: (
      tx: Tx,
      scoped: (resource: string) => Record<string, unknown> | null,
    ) => Promise<T>,
  ): Promise<T> {
    return withOrgContext(orgId, (tx) => {
      const scoped = (resource: string) => buildScopeWhere(ctx, resource);
      return fn(tx, scoped);
    });
  }

  return { withOrgContext, withoutOrgContext, withScopedContext };
}
