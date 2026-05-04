/**
 * Playwright extensions for the shared-lock dedup system.
 *
 * Apps wire it like this in their Playwright `test.beforeEach` or via a
 * fixture extension, and add `SharedLockReporter` to their `reporter` array
 * in `playwright.config.ts`.
 *
 * See `./shared-lock.ts` for the why/how.
 */

import { test as baseTest } from '@playwright/test';
import type { Reporter, TestCase, TestResult } from '@playwright/test/reporter';
import { sharedTags, shouldSkip, recordPass } from './shared-lock.js';

/**
 * Skips a test when any of its `@shared:*` tags has already been recorded
 * as passed in the current run's lockfile. Apps can either call this from
 * a manual `test.beforeEach` or use the `test` re-export below.
 */
export async function skipIfSharedAlreadyPassed(testInfo: {
  tags: readonly string[];
  skip: (reason?: string) => void;
}): Promise<void> {
  const tags = sharedTags(testInfo.tags);
  for (const tag of tags) {
    if (shouldSkip(tag)) {
      testInfo.skip(`shared-lock: ${tag} already passed in this run`);
      return;
    }
  }
}

/**
 * Drop-in replacement for the default `test` import that auto-applies the
 * shared-lock skip logic. Apps that want zero boilerplate can import this
 * instead of `@playwright/test`'s `test`.
 *
 * Everything else from `@playwright/test` is re-exported so specs can keep
 * a single import line (request, devices, types, etc.). The local `test`
 * binding below shadows the re-exported one — order matters.
 */
export * from '@playwright/test';
// eslint-disable-next-line import/export
//
// El skip se aplica vía un fixture auto en lugar de `test.beforeEach()` a
// top-level, porque este mismo módulo también se carga desde
// `playwright.config.ts` como reporter (clase default). Llamar a
// `test.beforeEach` durante la fase de carga de la config dispara
// "Playwright Test did not expect test.beforeEach() to be called here";
// los fixtures auto no tienen ese problema porque sólo se ejecutan al
// arrancar cada test.
export const test = baseTest.extend<{ _sharedLockGuard: void }>({
  _sharedLockGuard: [
    async ({}, use, testInfo) => {
      await skipIfSharedAlreadyPassed(testInfo);
      await use();
    },
    { auto: true },
  ],
});

/**
 * Playwright reporter that writes successful `@shared:*` tags to the
 * lockfile. Add to `playwright.config.ts`:
 *
 *   reporter: [
 *     ['list'],
 *     ['@mycolegal-app/ui/e2e/shared-lock-fixture', { appSlug: 'notaria' }],
 *   ],
 */
export default class SharedLockReporter implements Reporter {
  private appSlug?: string;
  constructor(options?: { appSlug?: string }) {
    this.appSlug = options?.appSlug;
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    if (result.status !== 'passed') return;
    const tags = sharedTags(test.tags ?? []);
    for (const tag of tags) {
      recordPass(tag, this.appSlug);
    }
  }
}
