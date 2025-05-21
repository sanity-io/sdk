import {loadEnvFiles} from './helpers/loadEnvFiles'
/**
 * Environment variables for E2E tests
 */

interface E2EEnv {
  /** The session token for authenticated tests */
  SDK_E2E_SESSION_TOKEN?: string
  /** Whether we're running in CI */
  CI?: string
}

loadEnvFiles()

/**
 * Get the E2E environment variables
 */
export function getE2EEnv(): E2EEnv {
  return {
    SDK_E2E_SESSION_TOKEN: process.env.SDK_E2E_SESSION_TOKEN,
    CI: process.env.CI,
  }
}
