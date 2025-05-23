import {defineConfig} from '@playwright/test'
import type {PlaywrightTestConfig} from '@playwright/test'
import {getE2EEnv} from './env'

const BASE_URL = 'http://localhost:3333'
const {CI} = getE2EEnv()

/**
 * @internal
 * Base Playwright configuration
 */
export const basePlaywrightConfig: PlaywrightTestConfig = {
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!CI,
  /* Retry on CI only */
  retries: CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [['html', {outputFolder: './e2e/test-report'}], ['list']],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    baseURL: BASE_URL,
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
    actionTimeout: 15000,
    navigationTimeout: 15000,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  /* Configure output directory for test results */
  outputDir: './e2e/test-results',
}

/**
 * @internal
 * Create a Playwright configuration
 * @param config - The configuration to merge with the base configuration
 * @returns The Playwright configuration
 */
export const createPlaywrightConfig = (
  config: Partial<PlaywrightTestConfig> = {},
): PlaywrightTestConfig => {
  return defineConfig({
    ...basePlaywrightConfig,
    ...config,
  })
}

export {expect, test} from './sdk-test'
