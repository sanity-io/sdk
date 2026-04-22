import {afterEach, describe, expect, it, vi} from 'vitest'

import {CORE_SDK_VERSION} from '../version'
import {
  createSdkAttributionMiddleware,
  createSdkRequester,
  SDK_ATTRIBUTION_PARAMS,
} from './sdkRequester'

const EXPECTED_SDK_VERSION = String(CORE_SDK_VERSION)

interface TestRequestOptions {
  url?: string
  uri?: string
  method?: string
}

const ORIGIN = 'https://example.test'

function runMiddleware(
  applicationId: string | undefined,
  opts: TestRequestOptions,
): TestRequestOptions {
  const middleware = createSdkAttributionMiddleware({applicationId})
  const result = middleware.processOptions!({...opts} as never)
  return result as TestRequestOptions
}

describe('createSdkAttributionMiddleware', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('appends _origin and _sdkVersion to request URLs', () => {
    vi.stubGlobal('window', {location: {origin: ORIGIN}})

    const result = runMiddleware(undefined, {url: 'https://api.sanity.io/v1/data/query/ds'})

    const parsed = new URL(result.url!)
    expect(parsed.searchParams.get(SDK_ATTRIBUTION_PARAMS.origin)).toBe(ORIGIN)
    expect(parsed.searchParams.get(SDK_ATTRIBUTION_PARAMS.sdkVersion)).toBe(EXPECTED_SDK_VERSION)
    expect(parsed.searchParams.get(SDK_ATTRIBUTION_PARAMS.appId)).toBeNull()
  })

  it('includes _appId when applicationId is provided', () => {
    vi.stubGlobal('window', {location: {origin: ORIGIN}})

    const result = runMiddleware('app-123', {url: 'https://api.sanity.io/v1/data/query/ds'})

    const parsed = new URL(result.url!)
    expect(parsed.searchParams.get(SDK_ATTRIBUTION_PARAMS.appId)).toBe('app-123')
  })

  it('omits _appId when applicationId is an empty string', () => {
    vi.stubGlobal('window', {location: {origin: ORIGIN}})

    const result = runMiddleware('', {url: 'https://api.sanity.io/v1/data/query/ds'})

    const parsed = new URL(result.url!)
    expect(parsed.searchParams.has(SDK_ATTRIBUTION_PARAMS.appId)).toBe(false)
  })

  it('uses "server" as the origin when window is unavailable', () => {
    vi.stubGlobal('window', undefined)

    const result = runMiddleware(undefined, {url: 'https://api.sanity.io/v1/data/query/ds'})

    const parsed = new URL(result.url!)
    expect(parsed.searchParams.get(SDK_ATTRIBUTION_PARAMS.origin)).toBe('server')
  })

  it('appends to an existing query string rather than overwriting it', () => {
    vi.stubGlobal('window', {location: {origin: ORIGIN}})

    const result = runMiddleware('app-123', {
      url: 'https://api.sanity.io/v1/data/query/ds?query=*&tag=sanity.sdk.test',
    })

    const parsed = new URL(result.url!)
    expect(parsed.searchParams.get('query')).toBe('*')
    expect(parsed.searchParams.get('tag')).toBe('sanity.sdk.test')
    expect(parsed.searchParams.get(SDK_ATTRIBUTION_PARAMS.origin)).toBe(ORIGIN)
    expect(parsed.searchParams.get(SDK_ATTRIBUTION_PARAMS.sdkVersion)).toBe(EXPECTED_SDK_VERSION)
    expect(parsed.searchParams.get(SDK_ATTRIBUTION_PARAMS.appId)).toBe('app-123')
  })

  it('falls back to opts.uri when opts.url is not set', () => {
    vi.stubGlobal('window', {location: {origin: ORIGIN}})

    const result = runMiddleware(undefined, {uri: 'https://api.sanity.io/v1/data/query/ds'})

    expect(result.url).toMatch(/^https:\/\/api\.sanity\.io\/v1\/data\/query\/ds\?/)
  })

  it('leaves opts.url untouched when neither url nor uri is set', () => {
    vi.stubGlobal('window', {location: {origin: ORIGIN}})

    const result = runMiddleware(undefined, {})

    expect(result.url).toBeUndefined()
  })
})

describe('createSdkRequester', () => {
  it('returns a requester with use/clone methods (get-it Requester API)', () => {
    const requester = createSdkRequester()
    expect(typeof requester).toBe('function')
    expect(typeof requester.use).toBe('function')
    expect(typeof requester.clone).toBe('function')
  })
})
