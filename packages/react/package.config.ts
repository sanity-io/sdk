import {basePackageConfig} from '@repo/package.config'
import {defineConfig} from '@sanity/pkg-utils'

const enableVisualizer = process.env['VISUALIZER'] === 'true'

// rollup-plugin-visualizer is ESM-only from v7 onward, but @sanity/pkg-utils
// loads this config file via createRequire(). A static import would fail at
// build time even when VISUALIZER is unset. Defer to a dynamic import and let
// Rollup await the resulting plugin promise. The cast is needed because
// pkg-utils types `rollup.plugins` as Plugin[] though Rollup itself accepts
// MaybePromise<Plugin> entries.
const visualizerPlugin = enableVisualizer
  ? (import('rollup-plugin-visualizer').then(({visualizer}) =>
      visualizer({filename: './stats/index.html', open: false}),
    ) as unknown as Plugin)
  : null

export default defineConfig({
  ...basePackageConfig,
  tsconfig: 'tsconfig.dist.json',
  babel: {
    reactCompiler: true,
  },
  reactCompilerOptions: {
    target: '18',
  },
  rollup: {
    plugins: visualizerPlugin ? [visualizerPlugin] : [],
  },
})
