/**
 * localStorage key that forces error reporting on, for debugging the reporter itself.
 */
const DEBUG_KEY = 'SANITY_DEBUG_ERROR_REPORTING'

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
 * Error reporting only runs in apps where Sanity serves the SDK bundle (auto-updating apps), or
 * when the debug flag is set. It never runs outside a browser.
 *
 * @internal
 */
export function isErrorReportingEnabled(): boolean {
  if (typeof window === 'undefined') return false
  return hasDebugFlag() || hasSdkPackageInImportMap()
}
