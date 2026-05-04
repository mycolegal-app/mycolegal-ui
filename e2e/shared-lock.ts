/**
 * Cross-app e2e dedup for shared-infra tests.
 *
 * Why this exists
 * ───────────────
 * Tests that exercise mycolegal-auth (login, profile, change-password,
 * incidents) or shared mycolegal-ui components (UserAccountDialog,
 * IncidentReporter, NotificationsBell, DocFillingModal) live inside each
 * consumer app's Playwright suite. When `mycolegal-platform/scripts/run-e2e.sh`
 * iterates apps in sequence, the same shared contract is re-tested N times.
 *
 * This module lets the orchestrator skip those duplicates within a single
 * run, while keeping per-app local runs untouched (no env → no skipping).
 *
 * Mechanism
 * ─────────
 *   1. The orchestrator builds a per-tag RUN_ID from the SHAs of the upstream
 *      repos a tag depends on (see mycolegal-platform/scripts/shared-test-deps.json),
 *      writes them into a single `lockfile.json` in mycolegal-platform/.e2e-lock/,
 *      and exports `E2E_LOCK_PATH` to that file.
 *   2. Each app's Playwright config calls `attachSharedLock()` from
 *      `playwright.config.ts` (or registers a fixture) so that:
 *        - test.beforeEach checks `shouldSkip(tag)` for every `@shared:*` tag
 *          on the test and calls `test.skip()` if the lockfile has it marked
 *          passed for the current RUN_ID.
 *        - On test pass, `recordPass(tag, runIdForTag)` writes the entry.
 *
 * Lockfile shape
 * ──────────────
 *   {
 *     "@shared:auth-profile":      { "runId": "<sha>", "passedAt": "2026-05-04T…" },
 *     "@shared:incidents-org-app": { "runId": "<sha>", "passedAt": "…" }
 *   }
 *
 * When a tag's RUN_ID changes (because one of its upstream repos was
 * touched), the previous entry is treated as stale and the test runs again.
 *
 * No-op outside orchestration
 * ───────────────────────────
 * If `E2E_LOCK_PATH` is unset, every helper short-circuits to the local-run
 * default: nothing is skipped, nothing is written. Devs running
 * `pnpm test:e2e` inside a single app see no behavioural change.
 */

import * as fs from 'fs';
import * as path from 'path';

export const SHARED_TAG_PREFIX = '@shared:';

interface LockEntry {
  runId: string;
  passedAt: string;
  passedBy?: string; // app slug that recorded the pass — for debugging
}

type Lockfile = Record<string, LockEntry>;

function lockPath(): string | null {
  return process.env.E2E_LOCK_PATH || null;
}

/**
 * Per-tag RUN_IDs are precomputed by the orchestrator and exported as a
 * JSON-encoded env var (`E2E_LOCK_RUN_IDS`). Lookup is O(1) and avoids
 * spawning git per spec just to compute SHAs.
 *
 * Shape: `{ "@shared:auth-profile": "<sha>", … }`
 */
function runIdsByTag(): Record<string, string> {
  const raw = process.env.E2E_LOCK_RUN_IDS;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed ? parsed : {};
  } catch {
    return {};
  }
}

function loadLockfile(): Lockfile {
  const p = lockPath();
  if (!p) return {};
  try {
    if (!fs.existsSync(p)) return {};
    const raw = fs.readFileSync(p, 'utf8');
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed ? (parsed as Lockfile) : {};
  } catch {
    return {};
  }
}

function saveLockfile(lock: Lockfile): void {
  const p = lockPath();
  if (!p) return;
  // The orchestrator created the directory; mkdirSync is defensive in case
  // a dev points E2E_LOCK_PATH at a non-existent dir for ad-hoc testing.
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(lock, null, 2));
}

/**
 * Returns the list of `@shared:*` tags on a Playwright test (the value
 * returned by `testInfo.tags`). Filters out everything else.
 */
export function sharedTags(tags: readonly string[]): string[] {
  return tags.filter((t) => t.startsWith(SHARED_TAG_PREFIX));
}

/**
 * Should this tag be skipped for the current run? True only when:
 *   - E2E_LOCK_PATH is set (we're under orchestration), AND
 *   - The lockfile has an entry for this tag, AND
 *   - The recorded runId matches the current per-tag runId.
 */
export function shouldSkip(tag: string): boolean {
  if (!lockPath()) return false;
  const lock = loadLockfile();
  const entry = lock[tag];
  if (!entry) return false;
  const expectedRunId = runIdsByTag()[tag];
  if (!expectedRunId) {
    // Unknown tag → no dedup, run the test (and the dep map needs updating).
    return false;
  }
  return entry.runId === expectedRunId;
}

/**
 * Mark a tag as passed for this run. Only writes when E2E_LOCK_PATH is set
 * AND a runId is known for the tag (an unknown tag in the dep map would
 * silently dedup forever, which is worse than running once extra).
 *
 * Concurrent writers: Playwright runs workers in parallel, so two tests with
 * the same tag could race on the JSON file. We tolerate the race because the
 * payload is identical and the worst-case outcome is a partial write that
 * the next reader treats as "no entry" and re-runs the test — safe.
 */
export function recordPass(tag: string, passedBy?: string): void {
  if (!lockPath()) return;
  const runId = runIdsByTag()[tag];
  if (!runId) return;
  const lock = loadLockfile();
  lock[tag] = {
    runId,
    passedAt: new Date().toISOString(),
    passedBy,
  };
  saveLockfile(lock);
}
