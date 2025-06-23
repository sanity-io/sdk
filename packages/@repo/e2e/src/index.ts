import path from 'node:path'
import {fileURLToPath} from 'node:url'

import {defineConfig, devices, type PlaywrightTestConfig} from '@playwright/test'

import {getE2EEnv} from './helpers/getE2EEnv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SETUP_DIR = path.join(path.dirname(__dirname), 'src', 'setup')
const TEARDOWN_DIR = path.join(path.dirname(__dirname), 'src', 'teardown')
const AUTH_FILE = path.join(path.dirname(__dirname), '.auth', 'user.json')
const BASE_URL = 'http://localhost:3333/'

const {CI, SDK_E2E_ORGANIZATION_ID} = getE2EEnv()

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
  /* Projects configuration */
  projects: [
    {
      name: 'setup',
      testDir: SETUP_DIR,
      testMatch: /.*\.setup\.ts/,
      teardown: 'cleanup',
    },
    {
      name: 'cleanup',
      testDir: TEARDOWN_DIR,
      testMatch: /.*\.teardown\.ts/,
    },
    {
      name: 'chromium',
      use: {...devices['Desktop Chrome'], storageState: AUTH_FILE, baseURL: BASE_URL},
      dependencies: ['setup'],
    },
    {
      name: 'firefox',
      use: {...devices['Desktop Firefox'], storageState: AUTH_FILE, baseURL: BASE_URL},
      dependencies: ['setup'],
    },
    {
      name: 'webkit',
      use: {...devices['Desktop Safari'], storageState: AUTH_FILE, baseURL: BASE_URL},
      dependencies: ['setup'],
    },
    {
      name: 'dashboard-chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: AUTH_FILE,
        baseURL: `https://www.sanity.work/@${SDK_E2E_ORGANIZATION_ID}/application/__dev/`,
      },
      dependencies: ['setup'],
    },
  ],
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

// Export test fixtures
export {expect, test} from './fixtures'
