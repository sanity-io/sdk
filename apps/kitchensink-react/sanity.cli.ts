import {resolve} from 'node:path'

import {defineCliConfig} from 'sanity/cli'

// Point the Portable Text packages at a local build of the portabletext/editor
// monorepo instead of the published npm versions:
//   PTE_LOCAL_PKGS=/path/to/editor/packages pnpm dev
// The aliases target the build output (editor -> lib/*, plugin -> dist/*), so
// rebuild there (`pnpm build` in packages/editor and packages/plugin-sdk-value)
// to pick up changes. Their own imports (react, @sanity/sdk-react) still hit
// this config's aliases and dedupe, so context identity is preserved.
const PTE_LOCAL_PKGS = process.env['PTE_LOCAL_PKGS'] || ''

export default defineCliConfig({
  app: {
    // Use e2e organization ID if provided, otherwise use dev organization ID
    organizationId: process.env['SANITY_APP_E2E_ORGANIZATION_ID'] || 'oblZgbTFj',
    entry: './src/App.tsx',
    icon: './assets/favicon-kitchensink.svg',
  },
  deployment: {
    appId: 'wkyoigmzawwnnwx458zgoh46',
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
      alias: [
        ...Object.entries({
          ...prev.resolve?.alias,
          '@sanity/sdk': resolve(import.meta.dirname, '../../packages/core/src/_exports'),
          '@sanity/sdk-react': resolve(import.meta.dirname, '../../packages/react/src/_exports'),
        }).map(([find, replacement]) => ({find, replacement: replacement as string})),
        // Regex finds with $ anchors so subpath exports resolve precisely
        // (a string find would rewrite `@portabletext/editor/selectors` into
        // a path inside lib/index.js).
        ...(PTE_LOCAL_PKGS
          ? [
              {
                find: /^@portabletext\/editor\/plugins$/,
                replacement: `${PTE_LOCAL_PKGS}/editor/lib/plugins/index.js`,
              },
              {
                find: /^@portabletext\/editor\/behaviors$/,
                replacement: `${PTE_LOCAL_PKGS}/editor/lib/behaviors/index.js`,
              },
              {
                find: /^@portabletext\/editor\/selectors$/,
                replacement: `${PTE_LOCAL_PKGS}/editor/lib/selectors/index.js`,
              },
              {
                find: /^@portabletext\/editor$/,
                replacement: `${PTE_LOCAL_PKGS}/editor/lib/index.js`,
              },
              {
                find: /^@portabletext\/plugin-sdk-value$/,
                replacement: `${PTE_LOCAL_PKGS}/plugin-sdk-value/dist/index.js`,
              },
            ]
          : []),
      ],
      // The aliased build files resolve react from their own repo's
      // node_modules; force this app's single copy so hooks and contexts
      // stay shared.
      ...(PTE_LOCAL_PKGS
        ? {dedupe: [...(prev.resolve?.dedupe ?? []), 'react', 'react-dom', 'react-is']}
        : {}),
    },
    ...(PTE_LOCAL_PKGS
      ? {
          server: {
            ...prev.server,
            fs: {
              ...prev.server?.fs,
              // Explicit allow replaces Vite's default (the workspace root),
              // so list both this monorepo and the aliased editor repo.
              allow: [
                ...(prev.server?.fs?.allow ?? []),
                resolve(import.meta.dirname, '../..'),
                resolve(PTE_LOCAL_PKGS, '..'),
              ],
            },
          },
        }
      : {}),
    optimizeDeps: {
      ...prev.optimizeDeps,
      // Pre-bundling would inline a second copy of @sanity/sdk-react into the
      // plugin's chunk, giving it a different SanityInstanceContext than the
      // aliased workspace source the app renders. Serve it unbundled so both
      // resolve to the same modules.
      exclude: [...(prev.optimizeDeps?.exclude ?? []), '@portabletext/plugin-sdk-value'],
      // With the plugin excluded, its CJS sub-dependencies still need
      // pre-bundling for named-export interop.
      include: [
        ...(prev.optimizeDeps?.include ?? []),
        '@portabletext/plugin-sdk-value > @xstate/react > use-sync-external-store/shim',
        '@portabletext/plugin-sdk-value > @xstate/react > use-sync-external-store/shim/with-selector',
        // `debug` is CJS-only. The excluded plugin does `import rawDebug from 'debug'`,
        // which fails when Vite serves the raw browser build without a default export.
        // Nested form is required so pnpm can resolve it through the plugin.
        '@portabletext/plugin-sdk-value > debug',
      ],
    },
  }),
})
