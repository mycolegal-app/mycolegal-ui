/**
 * Data-row scope helpers for tenant-scoped queries.
 *
 * Companion to `server/rls.ts`. Where RLS scopes by `orgId`, scopes here
 * scope **within** an org by arbitrary attributes — e.g. "user AUCASA only
 * sees ArchivoPeticion rows whose entidadBancariaId IN (1)".
 *
 * Scopes are minted by `mycolegal-auth` into the JWT `scopes` claim and
 * apply per-app. Consumer apps:
 *   1. Decode the JWT and pass its `scopes` array into a `ScopeContext`.
 *   2. Use `buildScopeWhere(ctx, "ArchivoPeticion")` to build a Prisma
 *      `where` fragment to merge into reads.
 *   3. Call `assertScopeAllows(ctx, "ArchivoPeticion", data)` before
 *      writes to reject payloads that would violate the scope.
 *
 * **Semantics**:
 *   - Scopes belonging to other apps are filtered out by `appKey`.
 *   - Scopes for resources/attributes not in `manifest` are ignored
 *     (defensive: forward-compat with newer scope kinds).
 *   - Multiple scopes on the same `(resource, attribute)` combine as an
 *     OR (union of allowed values).
 *   - Across different attributes on the same resource, scopes combine
 *     as an AND (each attribute is an independent restriction).
 *   - Empty `scopes` (or `undefined`) → no restriction → caller passes
 *     its existing `where` unchanged.
 */

export type ScopeOp = 'IN' | 'EQ' | 'NOT_IN';

export interface JwtScope {
  app: string;
  resource: string;
  attribute: string;
  op: ScopeOp;
  values: string[];
}

/**
 * Per-app allowlist of scopable `(resource, attribute)` pairs. Scopes
 * referencing anything not declared here are dropped, so a future scope
 * type minted by auth doesn't accidentally apply to a model that wasn't
 * meant to be scopable.
 */
export interface ScopableResource {
  resource: string;
  attributes: string[];
}

export interface ScopeContext {
  appKey: string;
  /** May be undefined when the JWT has no `scopes` claim → unrestricted. */
  scopes?: JwtScope[];
  manifest: ScopableResource[];
}

/**
 * Internal: filter scopes down to those that apply to `(appKey, resource)`
 * and that match a `(resource, attribute)` declared in the manifest.
 */
function relevantScopes(ctx: ScopeContext, resource: string): JwtScope[] {
  if (!ctx.scopes || ctx.scopes.length === 0) return [];
  const allowed = ctx.manifest.find((m) => m.resource === resource);
  if (!allowed) return [];
  const allowedAttrs = new Set(allowed.attributes);
  return ctx.scopes.filter(
    (s) => s.app === ctx.appKey && s.resource === resource && allowedAttrs.has(s.attribute),
  );
}

/**
 * Build a Prisma `where` fragment that enforces `ctx.scopes` against
 * `resource`. Returns `null` when no scope applies (caller can skip the
 * merge entirely).
 *
 * Output shape (when scopes apply):
 *   { AND: [
 *       { OR: [ {attrA: {in: [...]}}, {attrA: {in: [...]}} ] },
 *       { attrB: { equals: 'x' } },
 *       { attrC: { notIn: [...] } },
 *   ] }
 *
 * Edge cases:
 *   - `IN` with empty values → `{ [attr]: { in: [] } }` (deny-all on that
 *     attribute). The caller's read returns zero rows, which is the
 *     correct fail-closed behavior.
 *   - `NOT_IN` with empty values → no-op (vacuously true), skipped.
 *   - `EQ` is treated as `IN` with a single value at read time so callers
 *     don't have to special-case it.
 */
export function buildScopeWhere(
  ctx: ScopeContext,
  resource: string,
): Record<string, unknown> | null {
  const scopes = relevantScopes(ctx, resource);
  if (scopes.length === 0) return null;

  const byAttr = new Map<string, JwtScope[]>();
  for (const s of scopes) {
    const arr = byAttr.get(s.attribute) ?? [];
    arr.push(s);
    byAttr.set(s.attribute, arr);
  }

  const andClauses: Record<string, unknown>[] = [];

  for (const [attr, attrScopes] of Array.from(byAttr.entries())) {
    const positives: Set<string> = new Set();
    const negatives: Set<string> = new Set();
    let anyPositive = false;

    for (const s of attrScopes) {
      if (s.op === 'IN' || s.op === 'EQ') {
        anyPositive = true;
        for (const v of s.values) positives.add(v);
      } else if (s.op === 'NOT_IN') {
        for (const v of s.values) negatives.add(v);
      }
    }

    if (anyPositive) {
      // Empty positives is intentional fail-closed: { in: [] } yields
      // no rows. Don't merge negatives into a positive whitelist; an
      // already-restricted set doesn't need a blacklist on top.
      andClauses.push({ [attr]: { in: Array.from(positives) } });
    } else if (negatives.size > 0) {
      andClauses.push({ [attr]: { notIn: Array.from(negatives) } });
    }
  }

  if (andClauses.length === 0) return null;
  if (andClauses.length === 1) return andClauses[0];
  return { AND: andClauses };
}

/**
 * Merge a caller-provided `where` with the scoped `where` for `resource`.
 * If no scope applies, returns `userWhere` as-is. If `userWhere` is
 * undefined, returns the scoped where (or `undefined` when neither
 * applies).
 *
 * Use at the boundary between an HTTP handler and Prisma:
 *
 *   const where = mergeScopedWhere(req.parsedFilters, ctx, 'ArchivoPeticion');
 *   await tx.archivoPeticion.findMany({ where });
 */
export function mergeScopedWhere(
  userWhere: Record<string, unknown> | undefined,
  ctx: ScopeContext,
  resource: string,
): Record<string, unknown> | undefined {
  const scoped = buildScopeWhere(ctx, resource);
  if (!scoped && !userWhere) return undefined;
  if (!scoped) return userWhere;
  if (!userWhere) return scoped;
  return { AND: [userWhere, scoped] };
}

export class ScopeViolationError extends Error {
  readonly resource: string;
  readonly attribute: string;
  readonly value: unknown;
  constructor(resource: string, attribute: string, value: unknown) {
    super(
      `Scope violation: ${resource}.${attribute} = ${JSON.stringify(value)} is not allowed by current scopes`,
    );
    this.name = 'ScopeViolationError';
    this.resource = resource;
    this.attribute = attribute;
    this.value = value;
  }
}

/**
 * Throws `ScopeViolationError` when `payload` would create/update a row
 * that violates `ctx.scopes` for `resource`. Only checks attributes
 * present in the payload — partial updates that don't touch a scoped
 * attribute pass through.
 *
 * For deeper safety, callers should also re-check on update by reading
 * the existing row with `buildScopeWhere` applied (a row outside the
 * scope is invisible to reads, so an update by id will already 0-match
 * if the row falls outside scope).
 */
export function assertScopeAllows(
  ctx: ScopeContext,
  resource: string,
  payload: Record<string, unknown>,
): void {
  const scopes = relevantScopes(ctx, resource);
  if (scopes.length === 0) return;

  const byAttr = new Map<string, JwtScope[]>();
  for (const s of scopes) {
    const arr = byAttr.get(s.attribute) ?? [];
    arr.push(s);
    byAttr.set(s.attribute, arr);
  }

  for (const [attr, attrScopes] of Array.from(byAttr.entries())) {
    if (!(attr in payload)) continue;
    const value = payload[attr];
    if (value === null || value === undefined) {
      // null assignment to a scoped attribute is rejected: writers can't
      // bypass the scope by clearing the attribute. If callers need to
      // null a scoped attribute (rare), they must do it from an
      // unrestricted context.
      throw new ScopeViolationError(resource, attr, value);
    }
    const stringified = String(value);

    let allowed = true;
    let anyPositive = false;
    const positives: Set<string> = new Set();
    const negatives: Set<string> = new Set();

    for (const s of attrScopes) {
      if (s.op === 'IN' || s.op === 'EQ') {
        anyPositive = true;
        for (const v of s.values) positives.add(v);
      } else if (s.op === 'NOT_IN') {
        for (const v of s.values) negatives.add(v);
      }
    }

    if (anyPositive && !positives.has(stringified)) allowed = false;
    if (negatives.has(stringified)) allowed = false;

    if (!allowed) throw new ScopeViolationError(resource, attr, value);
  }
}
