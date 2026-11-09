/**
 * localStorage key that forces error reporting on, for debugging the reporter itself.
 */
const DEBUG_KEY = 'SANITY_DEBUG_ERROR_REPORTING'

/**
 * Hostnames of a dev server on this machine or the local network, where most errors come from
 * work in progress: loopback and unspecified addresses, private IPv4 ranges, private and
 * link-local IPv6, and `.localhost` and `.local` names.
 */
const LOCAL_HOSTNAME_PATTERN =
  /^(?:localhost|.+\.localhost|.+\.local|0\.0\.0\.0|127(?:\.\d{1,3}){3}|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}|169\.254(?:\.\d{1,3}){2}|\[(?:::1?|f[cd][0-9a-f]{0,2}:[^\]]*|fe80:[^\]]*)\])$/i

/** DOM implementations that run in Node for tests, such as an app's own Vitest or Jest suite. */
const TEST_DOM_USER_AGENT_PATTERN = /jsdom|happydom/i

/**
 * Whether the document has an import map with an `@sanity/sdk` entry. The Sanity CLI adds one
 * when an app is deployed with `autoUpdates`, so its presence means Sanity serves the SDK bundle.
 */
function hasSdkPackageInImportMap(): boolean {
  if (typeof document === 'undefined' || !('querySelectorAll' in document)) return false

  return Array.from(document.querySelectorAll('script[type="importmap"]')).some((entry) => {
    if (!entry.textContent) return false
    try {
      const imports = JSON.parse(entry.textContent).imports
      return Boolean(imports) && '@sanity/sdk' in imports
    } catch {
      return false
    }
  })
}

/**
 * How the page loaded the SDK: from the module server for an auto-updating app, or bundled
 * into the app's own build.
 *
 * @internal
 */
export function getSdkDelivery(): 'auto-updates' | 'bundled' {
  return hasSdkPackageInImportMap() ? 'auto-updates' : 'bundled'
}

/**
 * Whether the debug flag is set in localStorage. It also lets the origin filter accept this
 * repo's own source paths, which only appear in local development.
 *
 * @internal
 */
export function hasDebugFlag(): boolean {
  try {
    return typeof localStorage !== 'undefined' && Boolean(localStorage.getItem(DEBUG_KEY))
  } catch {
    return false
  }
}

/**
 * Whether the page runs on a local or development host. An empty hostname counts too: it is what
 * `file://` pages, Electron, and environments that shim `window` without a URL report.
 *
 * @internal
 */
export function isLocalDevelopment(): boolean {
  if (typeof window === 'undefined') return false
  const hostname = window.location?.hostname ?? ''
  return hostname === '' || LOCAL_HOSTNAME_PATTERN.test(hostname)
}

/** A DOM implementation that runs in Node for tests, or a browser driven by test automation. */
function isTestEnvironment(): boolean {
  if (typeof navigator === 'undefined') return false
  return navigator.webdriver === true || TEST_DOM_USER_AGENT_PATTERN.test(navigator.userAgent ?? '')
}

/**
 * Error reporting runs in browsers, except on a local or development host and in test
 * environments: DOM implementations that run in Node and browsers driven by test automation. The
 * debug flag turns it on anywhere in a browser. It never runs outside a browser.
 *
 * @internal
 */
export function isErrorReportingEnabled(): boolean {
  if (typeof window === 'undefined') return false
  if (hasDebugFlag()) return true
  return !isLocalDevelopment() && !isTestEnvironment()
}
