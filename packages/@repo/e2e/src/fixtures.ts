import {test as base} from '@playwright/test'
import {type MultipleMutationResult, SanityClient} from '@sanity/client'

import {getClient} from './helpers/clients'
import {cleanupDocuments, createDocuments, type DocumentStub} from './helpers/documents'

interface SanityFixtures {
  createDocuments: (
    data: DocumentStub[],
    options?: {asDraft?: boolean},
    dataset?: string,
  ) => Promise<MultipleMutationResult>
  getClient: (dataset?: string) => SanityClient
}

/**
 * @internal
 * Playwright test configuration for SDK E2E tests
 */
export const test = base.extend<SanityFixtures>({
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
})

export {expect} from '@playwright/test'
