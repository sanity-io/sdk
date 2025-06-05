import path from 'node:path'
import {test as setup} from '@playwright/test'
import {fileURLToPath} from 'node:url'
import type {Browser} from '@playwright/test'
import {getE2EEnv} from '../env'
import fs from 'node:fs/promises'

const __filename = fileURLToPath(import.meta.url)
const AUTH_FILE = path.join(path.dirname(__filename), '..', '..', '.auth', 'user.json')

/**
 * Used in CI to authenticate the user with the Sanity API
 */
const authenticateUser = async (browser: Browser) => {
  const env = getE2EEnv()

  // get a clean, isolated browser context to isolate this auth flow from other logic
  const context = await browser.newContext()

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

  // the previous request has set a connect.sid cookie
  // we can use that to get a session token
  const page = await context.newPage()

  const loginUrl = new URL('https://api.sanity.work/v1/auth/login/sanity')
  loginUrl.searchParams.set('origin', 'http://localhost:3333')
  loginUrl.searchParams.set('type', 'token')

  await page.goto(loginUrl.toString())

  // the /auth/login/sanity endpoint will redirect to the origin we set above
  // our own site / SDK will receive the token it sent in the request
  // and set it to be used by every other request
  await Promise.all([
    page.waitForURL('http://localhost:3333'),
    page.waitForLoadState('networkidle'),
  ])

  // get the "state" of the current browser we used to do the auth flow
  const state = await context.storageState()
  await context.close()
  // return it to be saved as a static file in a hidden directory
  // this will be used by the next tests as though we were logged in
  // and be destroyed when the tests are done
  return state
}

/**
 * Used in local development to inject the token into the local storage
 */
const injectLocalStorageToken = async (browser: Browser, e2eSessionToken: string) => {
  // get a clean, isolated browser context to isolate this auth flow from other logic
  const context = await browser.newContext()
  const page = await context.newPage()

  await page.addInitScript((token) => {
    window.addEventListener('load', () => {
      window.localStorage.setItem('__sanity_auth_token', JSON.stringify({token}))
    })
  }, e2eSessionToken)

  await page.goto('http://localhost:3333')

  const state = await context.storageState()
  await context.close()
  return state
}

setup('setup authentication', async ({browser}) => {
  const {CI, SDK_E2E_SESSION_TOKEN} = getE2EEnv()
  const state = CI
    ? await authenticateUser(browser)
    : await injectLocalStorageToken(browser, SDK_E2E_SESSION_TOKEN!)

  await fs.mkdir(path.dirname(AUTH_FILE), {recursive: true})
  await fs.writeFile(AUTH_FILE, JSON.stringify(state, null, 2))
})
