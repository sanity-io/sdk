import {loadEnvFiles} from './helpers/loadEnvFiles'

interface E2EEnv {
  /** The session token for authenticated tests */
  SDK_E2E_SESSION_TOKEN?: string
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
  let SDK_E2E_USER_ID: string | undefined
  let SDK_E2E_USER_PASSWORD: string | undefined
  let RECAPTCHA_E2E_STAGING_KEY: string | undefined
  if (CI) {
    SDK_E2E_USER_ID = readEnv('SDK_E2E_USER_ID')
    SDK_E2E_USER_PASSWORD = readEnv('SDK_E2E_USER_PASSWORD')
    RECAPTCHA_E2E_STAGING_KEY = readEnv('RECAPTCHA_E2E_STAGING_KEY')
  } else {
    SDK_E2E_SESSION_TOKEN = readEnv('SDK_E2E_SESSION_TOKEN')
  }

  return {
    SDK_E2E_SESSION_TOKEN,
    CI,
    SDK_E2E_USER_ID,
    SDK_E2E_USER_PASSWORD,
    RECAPTCHA_E2E_STAGING_KEY,
  }
}
