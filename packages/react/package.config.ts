import {basePackageConfig} from '@repo/package.config'
import {defineConfig} from '@sanity/pkg-utils'
import css from 'rollup-plugin-import-css'

export default defineConfig({
  ...basePackageConfig,
  tsconfig: 'tsconfig.dist.json',
  rollup: {
    plugins: [css()],
  },
})
