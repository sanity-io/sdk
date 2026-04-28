import {resolve} from 'node:path'

import react from '@vitejs/plugin-react'
// eslint-disable-next-line import/no-extraneous-dependencies
import {defineConfig} from 'vite'

export default defineConfig({
  server: {
    port: 3334,
    fs: {
      strict: false,
    },
  },
  plugins: [react()],
  clearScreen: false,
  resolve: {
    alias: {
      '@sanity/sdk': resolve(import.meta.dirname, '../../packages/core/src/_exports'),
      '@sanity/sdk-react': resolve(import.meta.dirname, '../../packages/react/src/_exports'),
    },
  },
})
