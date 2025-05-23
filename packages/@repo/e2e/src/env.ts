import {loadEnvFiles} from './helpers/loadEnvFiles'

/**
 * Environment variables for E2E tests
 */
type KnownEnvVar = 'SDK_E2E_SESSION_TOKEN' | 'CI'

interface E2EEnv {
  /** The session token for authenticated tests */
  SDK_E2E_SESSION_TOKEN?: string
  /** Whether we're running in CI */
  CI?: string
}

loadEnvFiles()

/**
 * Get the value of an environment variable, throwing if it's not found
 */
function readEnv(name: KnownEnvVar): string {
  const val = findEnv(name)
  if (val === undefined) {
    throw new Error(
      `Missing required environment variable "${name}". Make sure to copy \`.env.example\` to \`.env.local\``,
    )
  }
  return val
}

function findEnv(name: KnownEnvVar): string | undefined {
  return process.env[name]
}

/**
 * Get the E2E environment variables
 */
export function getE2EEnv(): E2EEnv {
  const CI = findEnv('CI')
  let SDK_E2E_SESSION_TOKEN: string | undefined
  if (!CI) {
    SDK_E2E_SESSION_TOKEN = readEnv('SDK_E2E_SESSION_TOKEN')
  }
  return {
    SDK_E2E_SESSION_TOKEN,
    CI,
  }
}
