import {resolve} from 'node:path'

import react from '@vitejs/plugin-react'
import {defineConfig, loadEnv} from 'vite'

const ReactCompilerConfig = {
  target: '18',
}

export default defineConfig(({mode}) => {
  const rootDir = resolve(process.cwd(), '../..')
  const env = loadEnv(mode, rootDir, '')

  const isE2E = mode === 'e2e'

  return {
    server: {
      port: 3340,
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
    define: {
      'import.meta.env.VITE_IS_E2E': JSON.stringify(isE2E),
      'import.meta.env.VITE_E2E_PROJECT_ID': JSON.stringify(
        process.env['SDK_E2E_PROJECT_ID'] || env['SDK_E2E_PROJECT_ID'],
      ),
      'import.meta.env.VITE_E2E_DATASET_0': JSON.stringify(
        process.env['SDK_E2E_DATASET_0'] || env['SDK_E2E_DATASET_0'],
      ),
      'import.meta.env.VITE_E2E_DATASET_1': JSON.stringify(
        process.env['SDK_E2E_DATASET_1'] || env['SDK_E2E_DATASET_1'],
      ),
    },
  }
})
