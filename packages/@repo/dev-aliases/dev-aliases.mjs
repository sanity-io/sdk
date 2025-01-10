/**
 * The path mappings/aliases used by various tools in the monorepo to map imported modules to
 * source files in order to speed up rebuilding and avoid having a separate watcher process to build
 * from `src` to `lib`.
 *
 * This file is currently read by:
 * - Vite when running the dev server (only when running in the kitchensink)
 * - Vitest when running test suite
 *
 * @type Record<string, string>
 */
export const devAliases = {
  '@sanity/sdk': 'core/src/_exports',
  '@sanity/sdk-react': 'react/src/_exports',
}
