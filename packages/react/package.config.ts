import {basePackageConfig} from '@repo/package.config'
import {defineConfig} from '@sanity/pkg-utils'
import css from 'rollup-plugin-import-css'
import visualizer from 'rollup-plugin-visualizer'

const enableVisualizer = process.env['VISUALIZER'] === 'true'

export default defineConfig({
  ...basePackageConfig,
  tsconfig: 'tsconfig.dist.json',
  rollup: {
    plugins: [
      css(),
      ...(enableVisualizer
        ? [
            visualizer({
              filename: './stats/index.html',
              open: false,
            }),
          ]
        : []),
    ],
  },
})
