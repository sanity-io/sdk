// @ts-check
import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

const PACKAGES_PATH = resolve(import.meta.dirname, '..', '..')

/**
 * @param {string} dir
 * @returns {{find: RegExp, replacement: string}[]}
 */
function aliasesFromExports(dir) {
  const {name, exports} = JSON.parse(
    readFileSync(resolve(PACKAGES_PATH, dir, 'package.json'), 'utf8'),
  )
  return Object.entries(exports).map(([subpath, target]) => ({
    find: new RegExp(`^${(name + subpath.slice(1)).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`),
    replacement: resolve(PACKAGES_PATH, dir, typeof target === 'string' ? target : target.source),
  }))
}

/**
 * Aliases mapping every subpath export of the SDK packages to its source file, so Vite and Vitest
 * run against `src` without a separate build step.
 *
 * Read by:
 * - Vitest via `@repo/config-test`
 * - Vite in `apps/kitchensink-react` and `apps/standalone-react`
 */
export const devAliases = [...aliasesFromExports('core'), ...aliasesFromExports('react')]
