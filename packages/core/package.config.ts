import baseConfig from '@repo/package.config'
import {defineConfig} from '@sanity/pkg-utils'

export default defineConfig({
  tsconfig: 'tsconfig.dist.json',
  ...baseConfig,
})
