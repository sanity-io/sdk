import {type CollaborationCommentsClient, type QueryParams} from '@sanity/client'

import {getClient} from './clients'
import {getE2EEnv} from './getE2EEnv'
import {startTimer} from './timer'

const env = getE2EEnv()

/** The collaboration API only serves `vX` while comments are experimental. */
const COMMENTS_API_VERSION = 'vX'

/**
 * The document a probe asks about. It does not have to exist: a request names
 * the store through its resource, so any id warms the same one.
 */
const WARM_UP_DOCUMENT_ID = 'e2e-comments-warm-up'

/** The filter the SDK listens and queries with, minus the variant scoping. */
const COMMENTS_FILTER = '_type == "sanity.comment" && target.document._ref == $targetRef'

/** How quickly a probe has to answer for the store to count as warm. */
const DEFAULT_THRESHOLD = 3_000

/** How long to keep probing before treating the API itself as broken. */
const DEFAULT_DEADLINE = 5 * 60_000

/**
 * Probes that have to answer in a row before the store counts as warm.
 *
 * A store does not go from cold to warm in one step: it comes up marginal, and
 * a single fast answer during that window is luck rather than readiness. Three
 * of them, spaced, is evidence.
 */
const REQUIRED_STREAK = 3

/** The gap between probes, which is what spreads a streak over time. */
const PROBE_GAP = 5_000

/** A client for one dataset's comment store, configured as the SDK configures its own. */
function getCommentsClient(dataset: string): CollaborationCommentsClient {
  return getClient(dataset).withConfig({
    apiVersion: COMMENTS_API_VERSION,
    collaboration: {organizationId: env.SANITY_APP_E2E_ORGANIZATION_ID},
  }).collaboration.comments
}

/**
 * Waits for the listener's `welcome` event, which is what the SDK's comment
 * store waits for before it fetches its first snapshot.
 */
function waitForWelcome(
  comments: CollaborationCommentsClient,
  params: QueryParams,
  timeout: number,
): Promise<void> {
  const events = comments.listen(`*[${COMMENTS_FILTER}]`, params, {
    events: ['welcome'],
    tag: 'comments.warm-up',
  })

  return new Promise<void>((resolve, reject) => {
    const subscription = events.subscribe({
      next: () => finish(resolve),
      error: (error: unknown) => finish(() => reject(error)),
    })
    const timer = setTimeout(
      () => finish(() => reject(new Error(`no welcome event within ${timeout}ms`))),
      timeout,
    )

    // Hoisted so the handlers above can call it. A listener only emits
    // asynchronously, so `timer` and `subscription` both exist by then.
    function finish(settle: () => void): void {
      clearTimeout(timer)
      subscription.unsubscribe()
      settle()
    }
  })
}

/**
 * One probe of a dataset's comment store: the listener connects and a snapshot
 * query answers, both inside `timeout`. Rejects when either does not.
 */
async function probe(dataset: string, timeout: number): Promise<void> {
  const comments = getCommentsClient(dataset)
  const params = {targetRef: comments.getTargetDocumentRef(WARM_UP_DOCUMENT_ID)}

  await Promise.all([
    waitForWelcome(comments, params, timeout),
    comments.fetch(`*[${COMMENTS_FILTER}] | order(_createdAt desc)`, params, {
      timeout,
      tag: 'comments.warm-up',
    }),
  ])
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function toReason(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Fires a single comment request so anything the API provisions on first use
 * starts now rather than when the comments spec runs, minutes later.
 *
 * Failure is the expected case on a dataset created seconds ago, so it is
 * swallowed: the point is to have asked, not to have been answered.
 *
 * @internal
 */
export async function primeCommentsApi(): Promise<void> {
  const dataset = env.SANITY_APP_E2E_DATASET_0
  const timer = startTimer(`Priming comments on ${dataset}`)

  try {
    await probe(dataset, DEFAULT_THRESHOLD)
    timer.end()
  } catch (error) {
    timer.fail(toReason(error))
  }
}

/**
 * Blocks until a dataset's comment store answers quickly.
 *
 * Comment stores are provisioned per resource, so a dataset created minutes
 * ago has a cold one: the listener's `welcome` and the snapshot query that
 * follows it can each take longer than a test is willing to wait, leaving the
 * page under test on its loading fallback until the assertions time out.
 * Waiting here instead keeps the tests' own timeouts meaningful.
 *
 * @internal
 */
export async function waitForCommentsApi(
  options: {dataset?: string; threshold?: number; deadline?: number} = {},
): Promise<void> {
  const {
    dataset = env.SANITY_APP_E2E_DATASET_0,
    threshold = DEFAULT_THRESHOLD,
    deadline = DEFAULT_DEADLINE,
  } = options

  const giveUpAt = Date.now() + deadline
  let probes = 0
  let streak = 0
  let lastError: unknown

  for (;;) {
    probes += 1
    const timer = startTimer(
      `Warming up comments on ${dataset} (probe ${probes}, ${streak}/${REQUIRED_STREAK} warm)`,
    )

    try {
      await probe(dataset, threshold)
      streak += 1
      timer.end()
      if (streak === REQUIRED_STREAK) return
    } catch (error) {
      lastError = error
      streak = 0
      timer.fail(toReason(error))
    }

    if (Date.now() >= giveUpAt) {
      throw new Error(
        `Comments on ${dataset} did not warm up in ${deadline}ms: ${toReason(lastError)}`,
      )
    }

    await delay(PROBE_GAP)
  }
}
