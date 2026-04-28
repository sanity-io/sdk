/**
 * Returns true when the given error looks like a dynamic-import or
 * code-split chunk-loading failure.
 *
 * These errors typically surface when a user has a tab open against a
 * previously-deployed version of an app and the JavaScript or CSS chunk
 * filenames have since changed: a fresh deployment removes the hashed assets
 * the open tab still references. Detecting them lets the SDK trigger an
 * automatic reload so the user gets the new build without manual intervention.
 *
 * Recognized shapes (webpack ChunkLoadError, Vite "Failed to fetch
 * dynamically imported module", Firefox "error loading dynamically imported
 * module", Safari "Importing a module script failed", and Vite "Unable to
 * preload CSS").
 *
 * @param error - The value to inspect. Anything that is not an Error
 *   instance returns false.
 * @returns True if the error matches a known import/chunk-load failure.
 *
 * @public
 */
export function isImportError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  if (error.name === 'ChunkLoadError') return true

  const message = error.message || ''
  return (
    /Loading chunk [\w-]+ failed/i.test(message) ||
    /Failed to fetch dynamically imported module/i.test(message) ||
    /error loading dynamically imported module/i.test(message) ||
    /Import(?:ing)? a module script failed/i.test(message) ||
    /Unable to preload CSS/i.test(message)
  )
}
