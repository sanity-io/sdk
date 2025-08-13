import {resolve} from 'node:path'

import react from '@vitejs/plugin-react'
import {defineConfig} from 'vite'

const ReactCompilerConfig = {
  target: '18',
}

export default defineConfig(() => {
  return {
    server: {
      port: 3341,
      fs: {strict: false},
    },
    plugins: [
      react({
        babel: {
          plugins: [['babel-plugin-react-compiler', ReactCompilerConfig]],
        },
      }),
    ],
    clearScreen: false,
    resolve: {
      alias: {
        '@sanity/sdk': resolve(import.meta.dirname, '../../packages/core/src/_exports'),
        '@sanity/sdk-react': resolve(import.meta.dirname, '../../packages/react/src/_exports'),
      },
    },
  }
})
