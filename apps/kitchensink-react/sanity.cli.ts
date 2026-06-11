import {resolve} from 'node:path'

import {defineCliConfig} from 'sanity/cli'

export default defineCliConfig({
  app: {
    // Use e2e organization ID if provided, otherwise use dev organization ID
    organizationId: process.env['SANITY_APP_E2E_ORGANIZATION_ID'] || 'oblZgbTFj',
    entry: './src/App.tsx',
    id: 'wkyoigmzawwnnwx458zgoh46',
  },
  // Compile with the React Compiler. Target React 19 so the output uses
  // react-compiler-runtime (a dependency of this app). The App SDK owns the
  // React plugin and applies this for both `sanity dev` and `sanity build`.
  reactCompiler: {target: '19'},
  // Extend the App SDK's internal Vite config to resolve the SDK to local source.
  // The SANITY_APP_E2E_* env vars the app reads are auto-exposed on
  // import.meta.env by the App SDK (SANITY_APP_ prefix) — no manual define needed.
  // envDir points at the turborepo root so the root .env is loaded (the App SDK
  // otherwise looks for .env in the app directory).
  vite: (prev) => ({
    ...prev,
    clearScreen: false,
    envDir: resolve(import.meta.dirname, '../..'),
    resolve: {
      ...prev.resolve,
      alias: {
        ...prev.resolve?.alias,
        '@sanity/sdk': resolve(import.meta.dirname, '../../packages/core/src/_exports'),
        '@sanity/sdk-react': resolve(import.meta.dirname, '../../packages/react/src/_exports'),
      },
    },
  }),
})
