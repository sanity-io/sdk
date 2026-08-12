import {defaultConfig} from '@repo/package.bundle'
import {defineConfig, mergeConfig} from 'vite'

export default defineConfig(() => {
  return mergeConfig(defaultConfig, {
    build: {
      lib: {
        entry: {
          'index': './src/_exports/index.ts',
          '_exports/_internal': './src/_exports/_internal.ts',
          '_exports/agent': './src/_exports/agent.ts',
          '_exports/comlink': './src/_exports/comlink.ts',
        },
      },
    },
  })
})
