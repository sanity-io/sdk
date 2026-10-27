import {type BrowserContext} from '@playwright/test'

import {getE2EEnv} from './getE2EEnv'

const env = getE2EEnv()

interface AuthConfig {
  origin: string
  expectedRedirectUrl: string
}

/**
 * Used to authenticate the user with the Sanity API
 * @param context - The browser context to use for authentication
 * @param config - Configuration for the authentication flow
 */
export const authenticateUser = async (
  context: BrowserContext,
  config: AuthConfig,
): Promise<void> => {
  const response = await context.request.post('https://accounts.sanity.work/api/v1/login', {
    headers: {
      'Content-Type': 'application/json',
    },
    data: {
      username: env.SDK_E2E_USER_ID,
      password: env.SDK_E2E_USER_PASSWORD,
      reCaptchaToken: env.RECAPTCHA_E2E_STAGING_KEY,
    },
  })

  if (!response.ok()) {
    throw new Error(`Failed to authenticate: ${response.statusText()}`)
  }

  const page = await context.newPage()

  const loginUrl = new URL('https://api.sanity.work/v1/auth/login/sanity')
  loginUrl.searchParams.set('origin', config.origin)
  loginUrl.searchParams.set('type', 'token')

  await page.goto(loginUrl.toString())

  // Wait for the redirect to complete AND network to be idle
  await page.waitForURL(config.expectedRedirectUrl)
  await page.close()
}
