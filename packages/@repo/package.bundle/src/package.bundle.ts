import babel from '@rolldown/plugin-babel'
import viteReact, {reactCompilerPreset} from '@vitejs/plugin-react'
import {escapeRegExp} from 'lodash-es'
import {esmExternalRequirePlugin, type UserConfig} from 'vite'

import {version} from '../package.json'

export const defaultConfig: UserConfig = {
  appType: 'custom',
  define: {
    'process.env.PKG_VERSION': JSON.stringify(version),
    'process.env.NODE_ENV': '"production"',
    'process.env': {},
  },
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    viteReact(),
    babel({presets: [reactCompilerPreset({target: '19'})]}),
    esmExternalRequirePlugin({
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
    }),
  ],
  build: {
    emptyOutDir: true,
    sourcemap: true,
    lib: {
      entry: {},
      formats: ['es'],
    },
    rolldownOptions: {
      output: {
        minify: true,
        exports: 'named',
        dir: 'lib',
        format: 'es',
        entryFileNames: `[name].mjs`,
        chunkFileNames: `[name].[hash].mjs`,
      },
      treeshake: true,
    },
  },
}
