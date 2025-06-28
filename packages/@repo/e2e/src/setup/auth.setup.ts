import path from 'node:path'
import {fileURLToPath} from 'node:url'

import {type BrowserContext, test as setup} from '@playwright/test'

import {getE2EEnv} from '../helpers/getE2EEnv'

const __filename = fileURLToPath(import.meta.url)
const AUTH_FILE = path.join(path.dirname(__filename), '..', '..', '.auth', 'user.json')
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
const authenticateUser = async (context: BrowserContext, config: AuthConfig) => {
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
  await Promise.all([
    page.waitForURL(config.expectedRedirectUrl),
    page.waitForLoadState('networkidle'),
  ])

  await page.close()
}

const setDashboardRedirectCookie = async (context: BrowserContext) => {
  const page = await context.newPage()

  // visit the dashboard url to set the redirect cookie
  await page.goto(
    `https://www.sanity.work/@${env.SDK_E2E_ORGANIZATION_ID}?dev=http://localhost:3333`,
  )

  // wait until the url is /application/__dev (indicating the redirect cookie was set)
  await page.waitForURL(`https://www.sanity.work/@${env.SDK_E2E_ORGANIZATION_ID}/application/__dev`)

  await page.close()
}

setup('setup authentication', async ({browser}) => {
  // Create a single browser context that will be used for all authentication operations
  const context = await browser.newContext()

  try {
    // Authenticate for standalone apps
    await authenticateUser(context, {
      origin: 'http://localhost:3333',
      expectedRedirectUrl: 'http://localhost:3333',
    })

    // Authenticate for embedded apps (Dashboard)
    await authenticateUser(context, {
      origin: 'https://www.sanity.work/api/dashboard/authenticate',
      expectedRedirectUrl: `https://www.sanity.work/@${env.SDK_E2E_ORGANIZATION_ID}`,
    })

    // Set the dashboard redirect cookie
    await setDashboardRedirectCookie(context)

    // Save the combined context state to the auth file
    // This will contain all cookies, localStorage, and sessionStorage from all operations
    await context.storageState({path: AUTH_FILE})
  } finally {
    // close the context to clean up resources
    await context.close()
  }
})
