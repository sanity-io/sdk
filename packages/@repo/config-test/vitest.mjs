// @ts-check
import {getVitestAliases} from '@repo/dev-aliases/vitest'
// eslint-disable-next-line no-restricted-imports
import * as vitest from 'vitest/config'

/**
 *
 * @param [config] {vitest.ViteUserConfig}
 * @return {vitest.ViteUserConfig}
 */
export function defineConfig(config) {
  return vitest.defineConfig({
    ...config,
    test: {
      ...config?.test,
      alias: {...config?.test?.alias, ...getVitestAliases()},
      typecheck: {
        ...config?.test?.typecheck,
        exclude: [
          ...(vitest.configDefaults.typecheck?.exclude || []),
          '.tmp/**',
          './dist/**',
          ...(config?.test?.typecheck?.exclude || []),
        ],
      },
      exclude: [
        ...vitest.configDefaults.exclude,
        '.tmp/**',
        './dist/**',
        ...(config?.test?.exclude || []),
      ],
    },
  })
}
