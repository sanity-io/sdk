// packages/core/src/profiler/netProfiler.ts
// Lightweight HTTP profiler for core. Safe in browser & Node (breakdowns only in browser).

export type FetchRecord = {
  id: string
  url: string
  method: string
  start: number // performance.now()-based when available; else Date.now()
  elapsed: number // end - start
  ok: boolean | null
  status: number | null
  cacheControl?: string | null
  age?: string | null
  serverTiming?: string | null
  // filled from ResourceTiming in browser when available:
  transferSize?: number
  encodedBodySize?: number
  decodedBodySize?: number
  nextHopProtocol?: string
}

export type ResourceRecord = {
  name: string
  initiatorType: string
  startTime: number
  duration: number
  transferSize: number
  encodedBodySize: number
  decodedBodySize: number
  nextHopProtocol?: string
  redirectTime: number
  dnsTime: number
  connectTime: number
  tlsTime: number
  ttfb: number
  responseTime: number
}

export type LongTaskRecord = {ts: number; duration: number}

const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined'
const perf = ((): {now: () => number; timeOrigin: number} => {
  if (typeof performance !== 'undefined' && performance.now) {
    return {now: () => performance.now(), timeOrigin: performance.timeOrigin ?? 0}
  }
  return {now: () => Date.now(), timeOrigin: 0}
})()

const state = {
  meta: {sessionId: '', startedAt: 0, env: (isBrowser ? 'browser' : 'node') as 'browser' | 'node'},
  resources: [] as ResourceRecord[],
  fetchCalls: [] as FetchRecord[],
  longTasks: [] as LongTaskRecord[],
  started: false,
}

const uuid = () =>
  typeof crypto?.randomUUID === 'function'
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)

function startBrowserObservers() {
  if (!isBrowser) return
  // Resource Timing
  try {
    const ro = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (e.entryType !== 'resource') continue
        const r = e as PerformanceResourceTiming
        state.resources.push({
          name: r.name,
          initiatorType: r.initiatorType,
          startTime: r.startTime,
          duration: r.duration,
          transferSize: r.transferSize ?? 0,
          encodedBodySize: r.encodedBodySize ?? 0,
          decodedBodySize: r.decodedBodySize ?? 0,
          nextHopProtocol: r.nextHopProtocol,
          redirectTime: r.redirectEnd - r.redirectStart,
          dnsTime: r.domainLookupEnd - r.domainLookupStart,
          connectTime: r.connectEnd - r.connectStart,
          tlsTime: r.secureConnectionStart > 0 ? r.connectEnd - r.secureConnectionStart : 0,
          ttfb: r.responseStart - r.requestStart,
          responseTime: r.responseEnd - r.responseStart,
        })
      }
    })
    ro.observe({type: 'resource', buffered: true})
  } catch {
    // no-op
  }

  // Long Tasks
  try {
    const lo = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        state.longTasks.push({ts: e.startTime, duration: e.duration})
      }
    })
    lo.observe({type: 'longtask', buffered: true})
  } catch {
    // no-op
  }

  // Dev convenience
  if (isBrowser) {
    ;(window as unknown as {__netProfileGet?: () => unknown}).__netProfileGet = getNetProfile
    ;(window as unknown as {__netProfileReset?: () => unknown}).__netProfileReset = resetNetProfile
    ;(window as unknown as {__netProfileSanity?: () => unknown}).__netProfileSanity =
      function (): unknown {
        try {
          const prof = getNetProfile() as {
            fetchCalls: Array<{
              id: string
              url: string
              method: string
              elapsed: number
              status: number | null
              cacheControl?: string | null
              age?: string | null
            }>
          }
          const rows = prof.fetchCalls
            .filter((r) => {
              try {
                const host = new URL(r.url, location.href).hostname
                return /(^|\.)sanity\.io$/i.test(host) || /sanity/i.test(host)
              } catch {
                return /sanity/i.test(r.url)
              }
            })
            .map((r) => {
              const transferSize = (r as {transferSize?: number}).transferSize
              let host = ''
              try {
                host = new URL(r.url, location.href).host
              } catch {
                host = ''
              }
              const cached =
                r.status === 304 || (typeof transferSize === 'number' && transferSize === 0)
              return {
                id: (r.id || '').slice(0, 8),
                method: r.method,
                status: r.status,
                ms: Math.round(r.elapsed),
                cache: r.cacheControl ?? '',
                age: r.age ?? '',
                host,
                cached,
                url: r.url,
              }
            })
          // eslint-disable-next-line no-console
          console.table(rows)
          return rows
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error(err)
          return []
        }
      }
  }
}

function isSanityHost(hostname: string): boolean {
  return /(^|\.)sanity\.io$/i.test(hostname) || /sanity/i.test(hostname)
}

interface XMLHttpRequestWithNP extends XMLHttpRequest {
  __np?: {id: string; method: string; url: string; start: number}
}

function installXHRProfiler(): void {
  if (!isBrowser) return
  const w = window as unknown as {
    __npXhrPatched?: boolean
    XMLHttpRequest: typeof XMLHttpRequest
  }
  if (w.__npXhrPatched) return
  w.__npXhrPatched = true

  const OriginalXHR = w.XMLHttpRequest
  const proto = OriginalXHR.prototype as XMLHttpRequestWithNP

  const originalOpen: typeof OriginalXHR.prototype.open = proto.open
  const originalSend: typeof OriginalXHR.prototype.send = proto.send

  // Patch open to remember method/url
  proto.open = function (
    this: XMLHttpRequestWithNP,
    method: string,
    url: string | URL,
    async?: boolean,
    username?: string | null,
    password?: string | null,
  ): void {
    try {
      const urlStr = typeof url === 'string' ? url : String(url)
      this.__np = {id: '', method: (method || 'GET').toUpperCase(), url: urlStr, start: 0}
    } catch {
      // no-op
    }
    return originalOpen.call(this, method, url, async ?? true, username ?? null, password ?? null)
  }

  // Patch send to set header (if sanity host) and record timings
  proto.send = function (
    this: XMLHttpRequestWithNP,
    body?: Document | XMLHttpRequestBodyInit | null,
  ): ReturnType<typeof originalSend> {
    const start = perf.now()
    const id = uuid()
    if (!this.__np) this.__np = {id: '', method: 'GET', url: '', start: 0}
    this.__np.id = id
    this.__np.start = start

    try {
      const absolute = new URL(this.__np.url, location.href)
      if (isSanityHost(absolute.hostname)) {
        try {
          this.setRequestHeader('X-Profiler-Request-Id', id)
        } catch {
          // no-op
        }
      }
    } catch {
      // no-op
    }

    const onDone = () => {
      try {
        const elapsed = perf.now() - start
        const urlFinal =
          this.responseURL && this.responseURL.length > 0 ? this.responseURL : this.__np?.url || ''
        const rawHeaders =
          typeof this.getAllResponseHeaders === 'function' ? this.getAllResponseHeaders() : ''
        const visible = (rawHeaders || '').toLowerCase()
        const hasHeader = (h: string) => visible.includes(`${h}:`)
        const safeGet = (h: string) => (hasHeader(h) ? this.getResponseHeader(h) : null)
        const rec: FetchRecord = {
          id,
          url: urlFinal,
          method: this.__np?.method || 'GET',
          start,
          elapsed,
          ok: typeof this.status === 'number' ? this.status >= 200 && this.status < 300 : null,
          status: typeof this.status === 'number' ? this.status : null,
          cacheControl: safeGet('cache-control'),
          age: safeGet('age'),
          serverTiming: safeGet('server-timing'),
        }
        state.fetchCalls.push(rec)
      } catch {
        // no-op
      } finally {
        this.removeEventListener('loadend', onDone)
        this.removeEventListener('error', onDone)
        this.removeEventListener('abort', onDone)
      }
    }

    this.addEventListener('loadend', onDone)
    this.addEventListener('error', onDone)
    this.addEventListener('abort', onDone)

    return originalSend.call(this, body ?? null)
  }
}

export function wrapFetch<T extends typeof fetch>(fetchImpl: T): T {
  // Return a wrapped fetch that records elapsed time & headers; no globals mutated.
  const wrapped = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const start = perf.now()
    const id = uuid()
    const url = typeof input === 'string' ? input : ((input as Request)?.url ?? String(input))
    const baseMethod =
      init?.method || (typeof input !== 'string' && (input as Request).method) || 'GET'
    const method = (baseMethod || 'GET').toUpperCase()

    // Optionally add correlation header for Sanity API hosts (browser only; safe no-op server side)
    let patchedInit = init
    try {
      const u = new URL(url, isBrowser ? location.href : 'http://localhost')
      const sanityHost = /(^|\.)sanity\.io$|sanity/i.test(u.host)
      if (sanityHost) {
        const hdrs = new Headers(
          init?.headers ||
            (typeof input !== 'string' ? (input as Request).headers : undefined) ||
            {},
        )
        hdrs.set('X-Profiler-Request-Id', id)
        patchedInit = {...(init || {}), headers: hdrs}
      }
    } catch {
      /* ignore */
    }

    let res: Response | undefined
    try {
      const call = fetchImpl as typeof fetch
      res = await call(input, patchedInit)
      return res!
    } finally {
      const elapsed = perf.now() - start
      const rec: FetchRecord = {
        id,
        url,
        method,
        start,
        elapsed,
        ok: res ? res.ok : null,
        status: res ? res.status : null,
        cacheControl: res?.headers?.get?.('cache-control') ?? null,
        age: res?.headers?.get?.('age') ?? null,
        serverTiming: res?.headers?.get?.('server-timing') ?? null,
      }
      // Prefer the response.url if available (can differ from request input)
      if (res?.url) {
        rec.url = res.url
      }
      // Attempt to enrich with ResourceTiming (browser)
      if (isBrowser && typeof performance?.getEntriesByName === 'function') {
        try {
          const entries = performance.getEntriesByName(
            rec.url,
            'resource',
          ) as PerformanceResourceTiming[]
          // Use the *last* entry for this URL as a heuristic
          const rt = entries && entries.length ? entries[entries.length - 1] : null
          if (rt) {
            rec.transferSize = rt.transferSize ?? undefined
            rec.encodedBodySize = rt.encodedBodySize ?? undefined
            rec.decodedBodySize = rt.decodedBodySize ?? undefined
            const nextHop = (rt as unknown as {nextHopProtocol?: string}).nextHopProtocol
            rec.nextHopProtocol = nextHop ?? undefined
          }
        } catch {
          // no-op
        }
      }
      state.fetchCalls.push(rec)
    }
  } as unknown as T
  return wrapped
}

export function startNetProfiler(opts?: {installGlobalFetch?: boolean}): void {
  if (state.started) return
  state.started = true
  state.meta.sessionId = uuid()
  state.meta.startedAt = perf.timeOrigin || Date.now()
  if (isBrowser) {
    startBrowserObservers()
    installXHRProfiler()
  }
  if (
    opts?.installGlobalFetch &&
    typeof (globalThis as {fetch?: typeof fetch}).fetch === 'function'
  ) {
    // Patch global fetch (use sparingly; library authors can instead inject wrapFetch)
    ;(globalThis as {fetch: typeof fetch}).fetch = wrapFetch(
      (globalThis as {fetch: typeof fetch}).fetch,
    )
  }
}

export type NetProfileSnapshot = {
  meta: {sessionId: string; startedAt: number; env: 'browser' | 'node'}
  resources: ResourceRecord[]
  fetchCalls: FetchRecord[]
  longTasks: LongTaskRecord[]
  started: boolean
}

export function getNetProfile(): NetProfileSnapshot {
  // Deep clone to keep callers from mutating internal state
  return JSON.parse(JSON.stringify(state)) as NetProfileSnapshot
}

export function resetNetProfile(): void {
  state.resources.length = 0
  state.fetchCalls.length = 0
  state.longTasks.length = 0
}
