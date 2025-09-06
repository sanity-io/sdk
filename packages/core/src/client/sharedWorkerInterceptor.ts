/* eslint-disable no-console */
import {requester as baseSanityRequester} from '@sanity/client'

// Lazily create and memoize a shared worker instance from a static URL
const getSharedWorker = (() => {
  let instance: SharedWorker | null = null
  const WORKER_URL = '/sanity-sdk-shared-worker.js'

  return () => {
    if (instance) return instance

    const hasSharedWorker = typeof SharedWorker !== 'undefined'
    if (!hasSharedWorker) return null

    try {
      instance = new SharedWorker(WORKER_URL, {name: 'sanity-sdk-shared-worker'})
      return instance
    } catch {
      return null
    }
  }
})()

// Track pending worker responses by correlation id
const pendingWorkerResponses = new Map<string, (response: unknown) => void>()
let hasAttachedWorkerListener = false

const ensureWorkerListener = (worker: SharedWorker) => {
  if (hasAttachedWorkerListener) return
  hasAttachedWorkerListener = true
  try {
    worker.port.addEventListener('message', (event: MessageEvent) => {
      const data = event.data as {type?: string; id?: string; response?: unknown}
      if (!data || data.type !== 'interceptResponse' || !data.id) return
      const resolve = pendingWorkerResponses.get(data.id)
      if (resolve) {
        pendingWorkerResponses.delete(data.id)
        resolve(data.response)
      }
    })
    worker.port.start()
  } catch {
    // noop
  }
}

export const sharedWorkerInterceptor = baseSanityRequester.clone().use({
  interceptRequest: (prev, event) => {
    console.log('interceptRequest', prev, event)
    const worker = getSharedWorker()
    if (!worker?.port?.postMessage) return prev

    ensureWorkerListener(worker)

    const {context} = event

    // Serialize context defensively
    let safeContext: unknown = '[unserializable-context]'
    try {
      safeContext = JSON.parse(JSON.stringify(context))
    } catch {
      // noop
    }

    // Fire-and-forget ping so the worker logs even if adapter isn't used yet
    try {
      worker.port.postMessage({
        type: 'interceptRequest',
        request: {url: '', method: 'PING', headers: {}, body: null, context: safeContext},
      })
    } catch {
      // noop
    }

    const sharedWorkerAdapter = async (opts: unknown, _ctx: unknown) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
      const responsePromise: Promise<unknown> = new Promise((resolve) => {
        pendingWorkerResponses.set(id, resolve)
      })

      try {
        worker.port.postMessage({
          type: 'interceptRequest',
          id,
          request: {
            url: (opts as {url: string}).url,
            method: (opts as {method: string}).method,
            headers: (opts as {headers?: Record<string, string>}).headers || {},
            body: (opts as {body?: unknown}).body,
            context: safeContext,
          },
        })
      } catch {
        // If posting fails, return synthetic error (do NOT hit network)
        return {
          url: (opts as {url: string}).url,
          method: (opts as {method: string}).method,
          headers: {'x-shared-worker-error': 'postMessageFailed'},
          body: {error: 'SharedWorker postMessage failed'},
          statusCode: 503,
          statusMessage: 'Service Unavailable',
        }
      }

      const timeoutMs = 10000
      const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs))
      const maybeResponse = (await Promise.race([responsePromise, timeout])) as unknown

      if (maybeResponse == null) {
        // Timeout: return synthetic timeout response (do NOT hit network)
        return {
          url: (opts as {url: string}).url,
          method: (opts as {method: string}).method,
          headers: {'x-shared-worker-error': 'timeout'},
          body: {error: 'SharedWorker request timed out'},
          statusCode: 504,
          statusMessage: 'Gateway Timeout',
        }
      }
      const resp = maybeResponse as {
        url: string
        method: string
        headers?: Record<string, string>
        body?: unknown
        statusCode: number
        statusMessage: string
      }
      const isSuccess = resp.statusCode >= 200 && resp.statusCode < 300
      const merged = {
        ...resp,
        headers: {
          ...(resp.headers || {}),
          'x-shared-worker-success': isSuccess ? '1' : '0',
        },
      }
      return merged as unknown as Promise<unknown>
    }

    event.adapter = sharedWorkerAdapter as unknown as typeof event.adapter
    console.log('event.adapter changed', event)
    return prev
  },
})
