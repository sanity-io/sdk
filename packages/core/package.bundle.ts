import {defaultConfig} from '@repo/package.bundle'
import {defineConfig, mergeConfig} from 'vite'

export default defineConfig(() => {
  return mergeConfig(defaultConfig, {
    build: {
      lib: {
        entry: {
          index: './src/_exports/index.ts',
          _internal: './src/_exports/_internal.ts',
          agent: './src/_exports/agent.ts',
          comlink: './src/_exports/comlink.ts',
          dashboard: './src/_exports/dashboard.ts',
        },
      },
    },
  })
})
