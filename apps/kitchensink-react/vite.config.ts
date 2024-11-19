import {resolve} from 'node:path'

import react from '@vitejs/plugin-react'
import {defineConfig} from 'vite'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      'sdk-core': resolve(import.meta.dirname, '../../packages/core/src'),
      'sdk-react': resolve(import.meta.dirname, '../../packages/react/src'),
    },
  },
  server: {
    cors: {
      origin: true,
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
      exposedHeaders: ['Set-Cookie'],
    },
  },
})
