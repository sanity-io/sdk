import {loadEnvFiles} from './loadEnvFiles'

interface E2EEnv {
  /** The project ID for the primary dataset */
  SANITY_APP_E2E_PROJECT_ID: string
  /** The organization  ID for the project */
  SANITY_APP_E2E_ORGANIZATION_ID: string
  /** The dataset for the primary dataset */
  SANITY_APP_E2E_DATASET_0: string
  /** The dataset for the secondary dataset (for multi-resource tests) */
  SANITY_APP_E2E_DATASET_1: string
  /** The session token for authenticated tests */
  SDK_E2E_SESSION_TOKEN: string
  /** Whether we're running in CI */
  CI?: boolean
  /** E2E test user ID */
  SDK_E2E_USER_ID: string
  /** E2E test user password */
  SDK_E2E_USER_PASSWORD: string
  /** E2E test recaptcha key for CI */
  RECAPTCHA_E2E_STAGING_KEY: string
  /** Vercel bypass secret for Dashboard deployment protection */
  VERCEL_AUTOMATION_BYPASS_SECRET: string
  /** The media library ID for media library tests */
  SANITY_APP_E2E_MEDIA_LIBRARY_ID: string
  /** The media library token for media library tests */
  SDK_E2E_MEDIA_LIBRARY_TOKEN: string
  /** The canvas ID for canvas tests */
  SANITY_APP_E2E_CANVAS_ID: string
  /** The canvas token for canvas tests */
  SDK_E2E_CANVAS_TOKEN: string
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
    // eslint-disable-next-line no-console
    console.error(
      `Environment variable "${name}" not found. Available env vars:`,
      Object.keys(process.env),
    )
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
  const CI = findEnv('CI') === 'true'
  const SANITY_APP_E2E_PROJECT_ID = readEnv('SANITY_APP_E2E_PROJECT_ID')
  const SANITY_APP_E2E_ORGANIZATION_ID = readEnv('SANITY_APP_E2E_ORGANIZATION_ID')
  const SANITY_APP_E2E_DATASET_0 = readEnv('SANITY_APP_E2E_DATASET_0')
  const SANITY_APP_E2E_DATASET_1 = readEnv('SANITY_APP_E2E_DATASET_1')
  const SDK_E2E_SESSION_TOKEN = readEnv('SDK_E2E_SESSION_TOKEN')
  const SDK_E2E_USER_ID = readEnv('SDK_E2E_USER_ID')
  const SDK_E2E_USER_PASSWORD = readEnv('SDK_E2E_USER_PASSWORD')
  const RECAPTCHA_E2E_STAGING_KEY = readEnv('RECAPTCHA_E2E_STAGING_KEY')
  const VERCEL_AUTOMATION_BYPASS_SECRET = readEnv('VERCEL_AUTOMATION_BYPASS_SECRET')
  const SANITY_APP_E2E_MEDIA_LIBRARY_ID = readEnv('SANITY_APP_E2E_MEDIA_LIBRARY_ID')
  const SDK_E2E_MEDIA_LIBRARY_TOKEN = readEnv('SDK_E2E_MEDIA_LIBRARY_TOKEN')
  const SANITY_APP_E2E_CANVAS_ID = readEnv('SANITY_APP_E2E_CANVAS_ID')
  const SDK_E2E_CANVAS_TOKEN = readEnv('SDK_E2E_CANVAS_TOKEN')
  return {
    CI,
    SANITY_APP_E2E_PROJECT_ID,
    SANITY_APP_E2E_ORGANIZATION_ID,
    SANITY_APP_E2E_DATASET_0,
    SANITY_APP_E2E_DATASET_1,
    SDK_E2E_SESSION_TOKEN,
    SDK_E2E_USER_ID,
    SDK_E2E_USER_PASSWORD,
    RECAPTCHA_E2E_STAGING_KEY,
    VERCEL_AUTOMATION_BYPASS_SECRET,
    SANITY_APP_E2E_MEDIA_LIBRARY_ID,
    SDK_E2E_MEDIA_LIBRARY_TOKEN,
    SANITY_APP_E2E_CANVAS_ID,
    SDK_E2E_CANVAS_TOKEN,
  }
}
