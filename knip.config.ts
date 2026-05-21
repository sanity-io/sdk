import {KnipConfig} from 'knip'

const project = ['src/**/*.{js,jsx,ts,tsx}', '!**/build/**', '!**/docs/**']

const config: KnipConfig = {
  workspaces: {
    '.': {
      typescript: {
        config: 'tsconfig.tsdoc.json',
      },
      // `open` is invoked by the test:coverage:open script.
      // `prerelease` is a positional argument to `pnpm version` in
      // scripts/release-branch.mts that knip's shell parser misidentifies
      // as a binary.
      ignoreBinaries: ['open', 'prerelease'],
      entry: ['package.config.ts'],
    },
    'scripts/*': {
      typescript: {
        config: 'tsconfig.json',
      },
      project,
    },
    'apps/kitchensink-react': {
      entry: ['src/css/css.config.js'],
      // disable playwright plugin: playwright.config.ts imports @repo/e2e which
      // may not be built yet, and knip crashes trying to load it as an entry file
      playwright: false,
      typescript: {
        config: 'tsconfig.json',
      },
      ignoreDependencies: ['@testing-library/react', 'react-compiler-runtime'],
      project,
    },
    'apps/*': {
      typescript: {
        config: 'tsconfig.json',
      },
      project,
    },
    'packages/*': {
      typescript: {
        config: 'tsconfig.settings.json',
      },
      project,
      ignoreDependencies: ['@sanity/browserslist-config'],
    },
    'packages/react': {
      typescript: {
        config: 'tsconfig.settings.json',
      },
      project,
      entry: ['package.config.ts'],
      ignore: ['src/**/*.test-d.ts'],
      ignoreDependencies: ['@sanity/browserslist-config', 'react-compiler-runtime'],
    },
    'packages/@repo/e2e': {
      typescript: {
        config: 'tsconfig.json',
      },
      project,
      entry: ['src/setup/**/*.ts', 'src/teardown/**/*.ts'],
    },
    'packages/core': {
      typescript: {
        config: 'tsconfig.settings.json',
      },
      project,
      entry: ['package.config.ts'],
      ignoreDependencies: ['@sanity/browserslist-config'],
    },
  },
}

export default config
