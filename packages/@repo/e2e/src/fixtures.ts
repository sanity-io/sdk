import {type BrowserContext, type Page, test as base} from '@playwright/test'
import {type MultipleMutationResult, SanityClient} from '@sanity/client'

import {getClient} from './helpers/clients'
import {cleanupDocuments, createDocuments, type DocumentStub} from './helpers/documents'
import {createPageContext, type PageContext} from './helpers/pageContext'

interface SanityFixtures {
  createDocuments: (
    data: DocumentStub[],
    options?: {asDraft?: boolean},
    dataset?: string,
  ) => Promise<MultipleMutationResult>
  getClient: (dataset?: string) => SanityClient
  getPageContext: (page: Page) => Promise<PageContext>
  context: BrowserContext
}

/**
 * @internal
 * Playwright test configuration for SDK E2E tests
 */
export const test = base.extend<SanityFixtures>({
  // Override context to grant local network access permission for Chromium
  // ref https://github.com/microsoft/playwright/issues/37769#issuecomment-3415573246
  context: async ({context}, use) => {
    if (context.browser()?.browserType().name() === 'chromium') {
      await context.grantPermissions(['local-network-access'])
    }
    await use(context)
  },
  // Playwright will error if we don't pass an object to destructure
  // eslint-disable-next-line no-empty-pattern
  createDocuments: async ({}, use) => {
    await use(createDocuments)

    // cleanup documents after each test
    await cleanupDocuments()
  },
  // eslint-disable-next-line no-empty-pattern
  getClient: async ({}, use) => {
    await use(getClient)
  },
  // eslint-disable-next-line no-empty-pattern
  getPageContext: async ({}, use, testInfo) => {
    const getPageContext = async (page: Page) => {
      return await createPageContext(page, testInfo.project.name)
    }
    await use(getPageContext)
  },
})

export {expect} from '@playwright/test'
