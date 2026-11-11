/** Browsers word a failed `fetch` differently, and all of them throw a plain `TypeError`. */
const NETWORK_FAILURE_MESSAGE = /failed to fetch|networkerror|load failed|network request failed/i

/**
 * Whether a request failed because the network did, which browsers report as a plain `TypeError`.
 *
 * @internal
 */
export function isNetworkFailure(error: unknown): boolean {
  return error instanceof TypeError && NETWORK_FAILURE_MESSAGE.test(error.message)
}
