import {basePackageConfig, bundleAnalyzerPlugins} from '@repo/package.config'
import {defineConfig} from '@sanity/pkg-utils'

export default defineConfig({
  ...basePackageConfig,
  tsconfig: 'tsconfig.dist.json',
  plugins: bundleAnalyzerPlugins(import.meta.url),
})
