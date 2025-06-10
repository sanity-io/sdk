import {loadEnvFiles} from './loadEnvFiles'

interface E2EEnv {
  /** The project ID for the primary dataset */
  SDK_E2E_PROJECT_ID: string
  /** The dataset for the primary dataset */
  SDK_E2E_DATASET_0: string
  /** The dataset for the secondary dataset (for multi-resource tests) */
  SDK_E2E_DATASET_1: string
  /** The session token for authenticated tests */
  SDK_E2E_SESSION_TOKEN: string
  /** Whether we're running in CI */
  CI?: string
  /** E2E test user ID */
  SDK_E2E_USER_ID?: string
  /** E2E test user password */
  SDK_E2E_USER_PASSWORD?: string
  /** E2E test recaptcha key for CI */
  RECAPTCHA_E2E_STAGING_KEY?: string
}

type KnownEnvVar = keyof E2EEnv

loadEnvFiles()

/**
 * Get the value of an environment variable, throwing if it's not found
 */
function readEnv(name: KnownEnvVar): string {
  // Skip environment validation during depcheck
  if (process.env['DEPCHECK']) {
    return 'dummy-value-for-depcheck'
  }
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
  const SDK_E2E_PROJECT_ID = readEnv('SDK_E2E_PROJECT_ID')
  const SDK_E2E_DATASET_0 = readEnv('SDK_E2E_DATASET_0')
  const SDK_E2E_DATASET_1 = readEnv('SDK_E2E_DATASET_1')
  const SDK_E2E_SESSION_TOKEN = readEnv('SDK_E2E_SESSION_TOKEN')

  let SDK_E2E_USER_ID: string | undefined
  let SDK_E2E_USER_PASSWORD: string | undefined
  let RECAPTCHA_E2E_STAGING_KEY: string | undefined

  if (CI) {
    SDK_E2E_USER_ID = readEnv('SDK_E2E_USER_ID')
    SDK_E2E_USER_PASSWORD = readEnv('SDK_E2E_USER_PASSWORD')
    RECAPTCHA_E2E_STAGING_KEY = readEnv('RECAPTCHA_E2E_STAGING_KEY')
  }

  return {
    CI,
    SDK_E2E_PROJECT_ID,
    SDK_E2E_DATASET_0,
    SDK_E2E_DATASET_1,
    SDK_E2E_SESSION_TOKEN,
    SDK_E2E_USER_ID,
    SDK_E2E_USER_PASSWORD,
    RECAPTCHA_E2E_STAGING_KEY,
  }
}
