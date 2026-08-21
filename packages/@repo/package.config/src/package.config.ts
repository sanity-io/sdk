import {createRequire} from 'node:module'
import {defineConfig} from '@sanity/pkg-utils'

export const basePackageConfig = defineConfig({
  tsdoc: {
    rules: {
      'ae-internal-missing-underscore': 'off',
    },
    customTags: [
      {
        name: 'thoughtLevel',
        allowMultiple: true,
        syntaxKind: 'block',
      },
      {
        name: 'todo',
        allowMultiple: true,
        syntaxKind: 'block',
      },
      {
        name: 'module',
        allowMultiple: true,
        syntaxKind: 'block',
      },
      {
        name: 'category',
        allowMultiple: true,
        syntaxKind: 'block',
      },
      {
        name: 'function',
        allowMultiple: false,
        syntaxKind: 'modifier',
      },
      {
        name: 'interface',
        syntaxKind: 'modifier',
        allowMultiple: false,
      },
      {
        name: 'inlineType',
        syntaxKind: 'block',
        allowMultiple: true,
      },
    ],
  },
})

type PkgPlugins = NonNullable<Parameters<typeof defineConfig>[0]['plugins']>

/**
 * Rolldown's built-in bundle analyzer (`format: 'md'`), gated by `VISUALIZER=true`.
 * Emits `dist/analyze-data.md`. Pass the caller's `import.meta.url` so `rolldown`
 * resolves from that package.
 *
 * Uses `createRequire` because a static `rolldown/experimental` import breaks the
 * `tsx` loader that `pkg build` uses for `package.config.ts`.
 *
 * @see https://rolldown.rs/builtin-plugins/bundle-analyzer
 * @param importerUrl - Caller's `import.meta.url`
 *
 * @internal
 */
export function bundleAnalyzerPlugins(importerUrl: string): PkgPlugins {
  if (process.env['VISUALIZER'] !== 'true') {
    return []
  }

  const {bundleAnalyzerPlugin} = createRequire(importerUrl)('rolldown/experimental') as {
    bundleAnalyzerPlugin: (options?: {format?: 'json' | 'md'; fileName?: string}) => object
  }

  return [bundleAnalyzerPlugin({format: 'md'})] as PkgPlugins
}
