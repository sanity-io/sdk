import {type BrowserContext, type Page, test as base} from '@playwright/test'
import {type MultipleMutationResult, SanityClient} from '@sanity/client'

import {getCanvasClient, getClient, getMediaLibraryClient} from './helpers/clients'
import {cleanupDocuments, createDocuments, type DocumentStub} from './helpers/documents'
import {createPageContext, type PageContext} from './helpers/pageContext'

interface SanityFixtures {
  createDocuments: (
    data: DocumentStub[],
    options?: {asDraft?: boolean},
    dataset?: string,
  ) => Promise<MultipleMutationResult>
  getClient: (dataset?: string) => SanityClient
  getMediaLibraryClient: () => SanityClient
  getCanvasClient: () => SanityClient
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
  // TEMP DIAGNOSTICS (debug/e2e-realtime-fetch-trace): the SDK's realtime channel
  // uses fetch/ReadableStream streaming (NOT EventSource), so we tee the live/listen
  // stream bodies via fetch to see WHEN change-notifications arrive on the wire vs.
  // when the UI updates — distinguishing "event arrived late", "event never arrived"
  // and "event arrived but projection didn't apply". Remove once the flake is understood.
  /* eslint-disable no-console */
  page: async ({page}, use, testInfo) => {
    const ctx = `${testInfo.project.name}/${testInfo.title.slice(0, 36)}`
    const diag = (m: string) => console.log(`[DIAG ${ctx}] ${m}`)

    page.on('pageerror', (err) => diag(`pageerror ${err.message}`))
    page.on('requestfailed', (req) => {
      const u = req.url()
      if (/live|listen|\/data\/(query|listen)|api\.sanity/.test(u)) {
        diag(`requestfailed ${req.failure()?.errorText} ${u.slice(-90)}`)
      }
    })
    // Normal (non-stream) refetches the query store issues after a change ping.
    page.on('response', (res) => {
      const u = res.url()
      if (/\/data\/query\//.test(u)) diag(`query-refetch ${res.status()} ${u.slice(-70)}`)
    })

    // Tee SSE stream bodies in every frame (incl. the dashboard iframe). Logs each
    // streamed chunk with elapsed-ms, so a `mutation`/live-event payload is visible
    // on the wire with a timestamp we can correlate to the test's edit + assertion.
    await page.addInitScript(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = window as any
      if (w.__fetchTraced || typeof w.fetch !== 'function') return
      w.__fetchTraced = true
      const origFetch = w.fetch.bind(w)
      const isStream = (u: string) => /live\/events|data\/listen/.test(u)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      w.fetch = async function (input: any, init: any) {
        const url = typeof input === 'string' ? input : (input && input.url) || ''
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let res: any
        try {
          res = await origFetch(input, init)
        } catch (e) {
          if (isStream(url)) console.log(`[SSE] FETCH-THREW ${String(url).slice(-60)} :: ${e}`)
          throw e
        }
        if (!isStream(url) || !res.body) return res
        try {
          const [a, b] = res.body.tee()
          const t0 = Date.now()
          const tag = `[SSE] ${String(url).slice(-55)}`
          console.log(`${tag} :: OPEN`)
          const reader = b.getReader()
          const dec = new TextDecoder()
          // background drain of the cloned branch
          ;(async () => {
            try {
              for (;;) {
                const {done, value} = await reader.read()
                if (done) {
                  console.log(`${tag} :: END @${Date.now() - t0}ms`)
                  break
                }
                const text = dec.decode(value, {stream: true}).replace(/\s+/g, ' ').trim()
                if (text) console.log(`${tag} :: @${Date.now() - t0}ms ${text.slice(0, 220)}`)
              }
            } catch (err) {
              console.log(`${tag} :: READ-ERR @${Date.now() - t0}ms ${err}`)
            }
          })()
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const Resp = (w as any).Response
          const clone = new Resp(a, {
            status: res.status,
            statusText: res.statusText,
            headers: res.headers,
          })
          try {
            Object.defineProperty(clone, 'url', {value: res.url})
          } catch {
            /* noop */
          }
          return clone
        } catch (err) {
          console.log(`[SSE] TEE-ERR ${String(url).slice(-55)} :: ${err}`)
          return res
        }
      }
    })

    await use(page)
  },
  /* eslint-enable no-console */
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
  getMediaLibraryClient: async ({}, use) => {
    await use(getMediaLibraryClient)
  },
  // eslint-disable-next-line no-empty-pattern
  getCanvasClient: async ({}, use) => {
    await use(getCanvasClient)
  },
  // eslint-disable-next-line no-empty-pattern
  getPageContext: async ({}, use, testInfo) => {
    const getPageContext = async (page: Page) => {
      return await createPageContext(page, testInfo.project.name)
    }
    await use(getPageContext)
  },
})
