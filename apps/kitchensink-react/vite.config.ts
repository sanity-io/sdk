import {resolve} from 'node:path'

import react from '@vitejs/plugin-react'
import {defineConfig, loadEnv} from 'vite'

const ReactCompilerConfig = {
  target: '18',
}

export default defineConfig(({mode}) => {
  // load env from root directory of turborepo
  const rootDir = resolve(process.cwd(), '../..')
  const env = loadEnv(mode, rootDir, '')

  return {
    server: {
      port: 5555,
      fs: {
        strict: false,
      },
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
    define: {
      'import.meta.env.VITE_IS_CI': JSON.stringify(
        process.env['CI'] === 'true' || env['CI'] === 'true',
      ),
    },
  }
})
