import {resolve} from 'node:path'

import react from '@vitejs/plugin-react'
import {defineConfig} from 'vite'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@sanity/sdk': resolve(import.meta.dirname, '../../packages/core/src/_exports'),
      '@sanity/sdk-react': resolve(import.meta.dirname, '../../packages/react/src/_exports'),
    },
  },
})
