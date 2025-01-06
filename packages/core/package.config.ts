import {basePackageConfig} from '@repo/package.config'
import {defineConfig} from '@sanity/pkg-utils'
import visualizer from 'rollup-plugin-visualizer'

const enableVisualizer = process.env['VISUALIZER'] === 'true'

export default defineConfig({
  ...basePackageConfig,
  tsconfig: 'tsconfig.dist.json',
  rollup: {
    plugins: [
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
