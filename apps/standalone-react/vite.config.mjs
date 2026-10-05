import {devAliases} from '@repo/dev-aliases'
import react from '@vitejs/plugin-react'
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
    alias: devAliases,
  },
})
