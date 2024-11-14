import {basePackageConfig} from '@repo/package.config'
import {defineConfig} from '@sanity/pkg-utils'

export default defineConfig({
  ...basePackageConfig,
  tsconfig: 'tsconfig.dist.json',
})
