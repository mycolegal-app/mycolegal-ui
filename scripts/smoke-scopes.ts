/**
 * Smoke test for `server/scopes.ts`.
 *
 * Run with: npx tsx scripts/smoke-scopes.ts
 *
 * Validates the contract documented in `server/scopes.ts`:
 *   1. No scopes → null where, no assertion failure.
 *   2. Single IN scope → { attr: { in: [...] } }.
 *   3. Two IN scopes on same attribute → union of values.
 *   4. Different attributes on same resource → AND of clauses.
 *   5. NOT_IN → { attr: { notIn: [...] } }.
 *   6. EQ behaves like IN with single value.
 *   7. Empty IN values → fail-closed { in: [] }.
 *   8. Empty NOT_IN values → no clause emitted.
 *   9. Scope from another app is filtered out.
 *  10. Scope on attribute not in manifest is dropped.
 *  11. mergeScopedWhere folds caller where + scoped where.
 *  12. assertScopeAllows: pass / fail / null payload / unrelated attr.
 */

import {
  buildScopeWhere,
  mergeScopedWhere,
  assertScopeAllows,
  ScopeViolationError,
  type ScopeContext,
  type JwtScope,
} from '../server/scopes';

declare const process: { exit: (code: number) => never };

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
}

function eq(a: unknown, b: unknown, msg: string) {
  assert(JSON.stringify(a) === JSON.stringify(b), `${msg}\n   expected: ${JSON.stringify(b)}\n   actual:   ${JSON.stringify(a)}`);
}

const manifest = [
  { resource: 'ArchivoPeticion', attributes: ['entidadBancariaId', 'registradorId'] },
];

const baseCtx = (scopes?: JwtScope[]): ScopeContext => ({
  appKey: 'archivo',
  scopes,
  manifest,
});

// 1. No scopes
{
  const ctx = baseCtx(undefined);
  assert(buildScopeWhere(ctx, 'ArchivoPeticion') === null, '1: no scopes → null');
  assertScopeAllows(ctx, 'ArchivoPeticion', { entidadBancariaId: 99 });
}

// 2. Single IN scope
{
  const ctx = baseCtx([
    { app: 'archivo', resource: 'ArchivoPeticion', attribute: 'entidadBancariaId', op: 'IN', values: ['1'] },
  ]);
  eq(buildScopeWhere(ctx, 'ArchivoPeticion'), { entidadBancariaId: { in: ['1'] } }, '2: single IN');
}

// 3. Two IN scopes same attribute → union
{
  const ctx = baseCtx([
    { app: 'archivo', resource: 'ArchivoPeticion', attribute: 'entidadBancariaId', op: 'IN', values: ['1', '2'] },
    { app: 'archivo', resource: 'ArchivoPeticion', attribute: 'entidadBancariaId', op: 'IN', values: ['2', '3'] },
  ]);
  const w = buildScopeWhere(ctx, 'ArchivoPeticion') as { entidadBancariaId: { in: string[] } };
  assert(w !== null, '3: union exists');
  const got = (w.entidadBancariaId.in as string[]).slice().sort();
  eq(got, ['1', '2', '3'], '3: union of values');
}

// 4. Different attributes → AND
{
  const ctx = baseCtx([
    { app: 'archivo', resource: 'ArchivoPeticion', attribute: 'entidadBancariaId', op: 'IN', values: ['1'] },
    { app: 'archivo', resource: 'ArchivoPeticion', attribute: 'registradorId', op: 'IN', values: ['r1'] },
  ]);
  const w = buildScopeWhere(ctx, 'ArchivoPeticion') as { AND: unknown[] };
  assert(Array.isArray(w?.AND) && w.AND.length === 2, '4: AND of 2 clauses');
}

// 5. NOT_IN
{
  const ctx = baseCtx([
    { app: 'archivo', resource: 'ArchivoPeticion', attribute: 'entidadBancariaId', op: 'NOT_IN', values: ['9'] },
  ]);
  eq(buildScopeWhere(ctx, 'ArchivoPeticion'), { entidadBancariaId: { notIn: ['9'] } }, '5: NOT_IN');
}

// 6. EQ → IN
{
  const ctx = baseCtx([
    { app: 'archivo', resource: 'ArchivoPeticion', attribute: 'entidadBancariaId', op: 'EQ', values: ['7'] },
  ]);
  eq(buildScopeWhere(ctx, 'ArchivoPeticion'), { entidadBancariaId: { in: ['7'] } }, '6: EQ as IN');
}

// 7. Empty IN values → fail-closed
{
  const ctx = baseCtx([
    { app: 'archivo', resource: 'ArchivoPeticion', attribute: 'entidadBancariaId', op: 'IN', values: [] },
  ]);
  eq(buildScopeWhere(ctx, 'ArchivoPeticion'), { entidadBancariaId: { in: [] } }, '7: empty IN deny-all');
}

// 8. Empty NOT_IN values → no clause
{
  const ctx = baseCtx([
    { app: 'archivo', resource: 'ArchivoPeticion', attribute: 'entidadBancariaId', op: 'NOT_IN', values: [] },
  ]);
  assert(buildScopeWhere(ctx, 'ArchivoPeticion') === null, '8: empty NOT_IN dropped');
}

// 9. Scope from another app is filtered out
{
  const ctx = baseCtx([
    { app: 'notaria', resource: 'ArchivoPeticion', attribute: 'entidadBancariaId', op: 'IN', values: ['1'] },
  ]);
  assert(buildScopeWhere(ctx, 'ArchivoPeticion') === null, '9: cross-app scope filtered');
}

// 10. Scope on attribute not in manifest is dropped
{
  const ctx = baseCtx([
    { app: 'archivo', resource: 'ArchivoPeticion', attribute: 'unknownAttr', op: 'IN', values: ['1'] },
  ]);
  assert(buildScopeWhere(ctx, 'ArchivoPeticion') === null, '10: unknown attribute dropped');
}

// 11. mergeScopedWhere
{
  const ctx = baseCtx([
    { app: 'archivo', resource: 'ArchivoPeticion', attribute: 'entidadBancariaId', op: 'IN', values: ['1'] },
  ]);
  const merged = mergeScopedWhere({ estado: 'EN_TRAMITE' }, ctx, 'ArchivoPeticion');
  eq(
    merged,
    { AND: [{ estado: 'EN_TRAMITE' }, { entidadBancariaId: { in: ['1'] } }] },
    '11: merge folds user where + scoped where',
  );
  // No-op when no scope
  const ctxNo = baseCtx(undefined);
  eq(mergeScopedWhere({ estado: 'X' }, ctxNo, 'ArchivoPeticion'), { estado: 'X' }, '11b: no scope passes through');
  // No user where
  eq(mergeScopedWhere(undefined, ctx, 'ArchivoPeticion'), { entidadBancariaId: { in: ['1'] } }, '11c: only scope');
  // Neither
  assert(mergeScopedWhere(undefined, ctxNo, 'ArchivoPeticion') === undefined, '11d: neither → undefined');
}

// 12. assertScopeAllows
{
  const ctx = baseCtx([
    { app: 'archivo', resource: 'ArchivoPeticion', attribute: 'entidadBancariaId', op: 'IN', values: ['1'] },
  ]);
  // pass
  assertScopeAllows(ctx, 'ArchivoPeticion', { entidadBancariaId: 1 });
  // fail
  let threw = false;
  try {
    assertScopeAllows(ctx, 'ArchivoPeticion', { entidadBancariaId: 99 });
  } catch (e) {
    threw = e instanceof ScopeViolationError;
  }
  assert(threw, '12: violating value throws ScopeViolationError');
  // null assignment to scoped attr → reject
  threw = false;
  try {
    assertScopeAllows(ctx, 'ArchivoPeticion', { entidadBancariaId: null });
  } catch (e) {
    threw = e instanceof ScopeViolationError;
  }
  assert(threw, '12b: null assignment to scoped attr rejected');
  // unrelated attribute → no check
  assertScopeAllows(ctx, 'ArchivoPeticion', { observaciones: 'foo' });
}

console.log('OK: smoke-scopes — 12/12 cases passed');
