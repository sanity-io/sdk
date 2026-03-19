import react from '@vitejs/plugin-react'
import {type UserConfig} from 'vite'
import tsconfigPaths from 'vite-tsconfig-paths'

import {version} from '../package.json'

// Replace with `RegExp.escape()` once Node 24 is the minimum target.
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export const defaultConfig: UserConfig = {
  appType: 'custom',
  define: {
    'process.env.PKG_VERSION': JSON.stringify(version),
    'process.env.NODE_ENV': '"production"',
    'process.env': {},
  },
  plugins: [
    react({
      babel: {plugins: [['babel-plugin-react-compiler', {}]]},
    }),
    tsconfigPaths(),
  ],
  build: {
    emptyOutDir: true,
    sourcemap: true,
    lib: {
      entry: {},
      formats: ['es'],
    },
    rollupOptions: {
      // self-externals are required here in order to ensure that the presentation
      // tool and future transitive dependencies that require sanity do not
      // re-include sanity in their bundle
      external: [
        'react',
        'react-dom',
        'styled-components',
        'sanity',
        '@sanity/sdk',
        '@sanity/sdk-react',
      ].flatMap((dependency) => [
        dependency,
        // this matches `react/jsx-runtime`, `sanity/presentation` etc
        new RegExp(`^${escapeRegExp(dependency)}\\/`),
      ]),
      output: {
        exports: 'named',
        dir: 'lib',
        format: 'es',
        entryFileNames: `[name].mjs`,
        chunkFileNames: `[name].[hash].mjs`,
      },
      treeshake: {
        preset: 'recommended',
      },
    },
  },
}
