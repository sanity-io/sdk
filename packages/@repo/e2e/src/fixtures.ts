import {test as base} from '@playwright/test'

/**
 * @internal
 * Playwright test configuration for SDK E2E tests
 * (If different apps diverge dramatically, we can move this logic)
 */
export const test = base.extend({
  // We'll add custom fixtures shortly
})

export {expect} from '@playwright/test'
