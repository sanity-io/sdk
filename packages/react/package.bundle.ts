import {defaultConfig} from '@repo/package.bundle'
import {defineConfig, mergeConfig} from 'vite'

export default defineConfig(() => {
  return mergeConfig(defaultConfig, {
    build: {
      lib: {
        entry: {
          'index': './src/_exports/index.ts',
          '_exports/dashboard': './src/_exports/dashboard.ts',
          '_exports/dashboard-internal': './src/_exports/dashboard-internal.ts',
        },
      },
    },
  })
})
