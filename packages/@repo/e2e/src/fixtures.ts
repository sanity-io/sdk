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
  // TEMP DIAGNOSTICS (debug/firefox-e2e-sse): instrument the live SSE / realtime
  // channel on every test + browser to diagnose flaky projection propagation.
  // Captures EventSource lifecycle + per-event delivery, failed/aborted realtime
  // requests, and page/console errors. Remove once the flake is understood.
  /* eslint-disable no-console */
  page: async ({page}, use, testInfo) => {
    const ctx = `${testInfo.project.name}/${testInfo.title.slice(0, 40)}`
    const diag = (m: string) => console.log(`[DIAG ${ctx}] ${m}`)

    page.on('console', (msg) => {
      const text = msg.text()
      if (
        msg.type() === 'error' ||
        /\[ES\]|EventSource|listen|live|sse|subscript|mutation|welcome|channel|disconnect|reconnect|abort/i.test(
          text,
        )
      ) {
        diag(`browser:${msg.type()} ${text}`)
      }
    })
    page.on('pageerror', (err) => diag(`pageerror ${err.message}`))
    page.on('requestfailed', (req) => {
      const u = req.url()
      if (/live|listen|query|\/data\/|api\.sanity/.test(u)) {
        diag(`requestfailed ${req.failure()?.errorText} ${u.slice(-90)}`)
      }
    })
    page.on('response', (res) => {
      const u = res.url()
      if (/live\/events|data\/listen/.test(u)) {
        diag(`response ${res.status()} ${u.slice(-90)}`)
      }
    })

    // Wrap EventSource in every frame (applies before app code runs) to log the
    // stream lifecycle and EVERY delivered event, so we can tell "events never
    // arrived" (transport/backend) from "events arrived but projection didn't
    // update" (SDK). addInitScript runs in all frames incl. the dashboard iframe.
    await page.addInitScript(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = window as any
      if (w.__esWrapped) return
      w.__esWrapped = true
      const Orig = w.EventSource
      if (!Orig) return
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Wrapped: any = function (url: string, cfg: unknown) {
        const es = new Orig(url, cfg)
        const t0 = Date.now()
        const tag = `[ES] ${String(url).slice(-70)}`
        const log = (m: string) => console.log(`${tag} :: ${m} @${Date.now() - t0}ms`)
        log('created')
        es.addEventListener('open', () => log('open'))
        es.addEventListener('error', () => log(`ERROR readyState=${es.readyState}`))
        // Tee every event the app subscribes to, so named events (mutation,
        // welcome, channelError, disconnect, …) are logged with truncated data.
        const origAdd = es.addEventListener.bind(es)
        es.addEventListener = function (type: string, handler: unknown, opts: unknown) {
          const wrapped = function (this: unknown, ev: {data?: unknown}) {
            try {
              const d = ev && ev.data ? String(ev.data).slice(0, 120) : ''
              log(`event '${type}' ${d}`)
            } catch {
              /* noop */
            }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const h = handler as any
            return typeof h === 'function'
              ? // eslint-disable-next-line prefer-rest-params
                h.apply(this, arguments)
              : h?.handleEvent?.(ev)
          }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return origAdd(type, wrapped as any, opts as any)
        }
        const origClose = es.close.bind(es)
        es.close = function () {
          log(`close() ${new Error().stack}`)
          return origClose()
        }
        return es
      }
      Wrapped.prototype = Orig.prototype
      Object.keys(Orig).forEach((k) => {
        try {
          Wrapped[k] = Orig[k]
        } catch {
          /* noop */
        }
      })
      w.EventSource = Wrapped
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
