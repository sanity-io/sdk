import {requester as defaultRequester} from '@sanity/client'

import {getOrigin} from '../utils/getOrigin'
import {CORE_SDK_VERSION} from '../version'

/**
 * Query param keys appended by the SDK for request attribution. Kept in a
 * single place so tests and Kong's `request-transformer` strip list can be
 * kept in sync.
 *
 * @internal
 */
export const SDK_ATTRIBUTION_PARAMS = {
  appId: '_appId',
  origin: '_origin',
  sdkVersion: '_sdkVersion',
} as const

type SdkRequester = typeof defaultRequester
type SdkMiddleware = NonNullable<Parameters<SdkRequester['use']>[0]>
type ProcessOptionsFn = NonNullable<SdkMiddleware['processOptions']>
type GetItRequestOptions = Parameters<ProcessOptionsFn>[0]

interface SdkAttributionOptions {
  /** Resolved application ID, if available. Omitted from the URL when falsy. */
  applicationId?: string
}

/**
 * A `get-it` middleware that appends SDK attribution query params (`_origin`,
 * `_sdkVersion`, and `_appId` when set) to every outgoing request URL.
 *
 * The middleware runs after `get-it`'s default `processOptions` (which encodes
 * `options.query` into `options.url`), so it appends directly to `options.url`
 * rather than mutating `options.query` (which has already been consumed).
 *
 * Kong's `request-transformer` plugin strips these params before they reach
 * upstream services (see SDK-1165).
 *
 * @internal
 */
export function createSdkAttributionMiddleware(options: SdkAttributionOptions = {}): SdkMiddleware {
  const {applicationId} = options
  const origin = getOrigin()
  const sdkVersion = String(CORE_SDK_VERSION)

  return {
    processOptions(opts: GetItRequestOptions) {
      const inputUrl = (opts as {url?: string}).url ?? (opts as {uri?: string}).uri
      if (typeof inputUrl !== 'string' || inputUrl.length === 0) return opts

      const params = new URLSearchParams()
      params.set(SDK_ATTRIBUTION_PARAMS.origin, origin)
      params.set(SDK_ATTRIBUTION_PARAMS.sdkVersion, sdkVersion)
      if (applicationId) {
        params.set(SDK_ATTRIBUTION_PARAMS.appId, applicationId)
      }

      const separator = inputUrl.includes('?') ? '&' : '?'
      ;(opts as {url?: string}).url = `${inputUrl}${separator}${params.toString()}`
      return opts
    },
  }
}

/**
 * Clones the default `@sanity/client` requester and adds the SDK attribution
 * middleware. The returned requester can be passed to `createClient` via the
 * `requester` config field.
 *
 * @internal
 */
export function createSdkRequester(options: SdkAttributionOptions = {}): SdkRequester {
  return defaultRequester.clone().use(createSdkAttributionMiddleware(options))
}
