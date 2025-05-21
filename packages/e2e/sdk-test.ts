import {test as base} from '@playwright/test'
import {getE2EEnv} from './env'

export const test = base.extend({
  // for most tests, ensure the page fixture has auth for local development
  // in CI we'll use  global setup file to do a full login
  page: async ({page}, use) => {
    const {SDK_E2E_SESSION_TOKEN} = getE2EEnv()

    // Set up the token to be injected after the page loads
    // We should only do this locally, not in CI
    await page.addInitScript((token) => {
      window.addEventListener('load', () => {
        window.localStorage.setItem('__sanity_auth_token', JSON.stringify({token}))
      })
    }, SDK_E2E_SESSION_TOKEN)

    await use(page)
  },
})

export {expect} from '@playwright/test'
