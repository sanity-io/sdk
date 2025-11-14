import {resolve} from 'node:path'

// eslint-disable-next-line import/no-extraneous-dependencies
import react from '@vitejs/plugin-react'
// eslint-disable-next-line import/no-extraneous-dependencies
import {defineConfig, loadEnv} from 'vite'

const ReactCompilerConfig = {
  target: '18',
}

export default defineConfig(({mode}) => {
  // load env from root directory of turborepo
  const rootDir = resolve(process.cwd(), '../..')
  const env = loadEnv(mode, rootDir, '')

  // Check if we're in e2e mode - either explicitly set or if SDK_E2E_ORGANIZATION_ID is present
  const isE2E = mode === 'e2e' || !!process.env['SDK_E2E_ORGANIZATION_ID']

  return {
    server: {
      port: 3333,
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
