import {join} from 'node:path'

import {KnipConfig} from 'knip'
import {match} from 'minimatch'

const project = ['src/**/*.{js,jsx,ts,tsx}', '!**/build/**', '!**/docs/**']

const baseConfig = {
  workspaces: {
    '.': {
      typescript: {
        config: 'tsconfig.tsdoc.json',
      },
      // Knip doesn't support pnpm version
      ignoreBinaries: ['version', 'sed', 'open'],
      entry: ['package.config.ts', 'vitest.config.mts'],
    },
    'scripts/*': {
      typescript: {
        config: 'tsconfig.json',
      },
      project,
    },
    'apps/kitchensink-react': {
      entry: ['src/main.tsx', 'src/css/css.config.js'],
      typescript: {
        config: 'tsconfig.json',
      },
      ignoreDependencies: [
        '@repo/tsconfig',
        '@testing-library/jest-dom',
        '@testing-library/react',
        'react-compiler-runtime',
      ],
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
      entry: ['package.bundle.ts'],
      ignoreDependencies: ['@sanity/browserslist-config'],
    },
    'packages/react': {
      typescript: {
        config: 'tsconfig.settings.json',
      },
      project,
      entry: ['package.bundle.ts'],
      ignoreDependencies: ['@sanity/browserslist-config', 'react-compiler-runtime'],
    },
    'packages/react-internal': {
      typescript: {
        config: 'tsconfig.settings.json',
      },
      project,
      entry: ['package.bundle.ts'],
      // for now -- will be removed once actual hooks are added
      ignoreDependencies: ['@sanity/sdk', '@sanity/sdk-react', '@sanity/browserslist-config'],
    },
    'packages/@repo/e2e': {
      typescript: {
        config: 'tsconfig.json',
      },
      project,
      entry: ['src/index.ts', 'src/setup/**/*.ts', 'src/teardown/**/*.ts'],
      ignoreDependencies: ['@repo/tsconfig'],
    },
    // TODO: Remove this once we have presence fully implemented in the SDK
    'packages/core': {
      typescript: {
        config: 'tsconfig.settings.json',
      },
      project,
      entry: ['package.bundle.ts'],
      ignore: ['src/presence/bifurTransport.ts', 'src/presence/types.ts'],
      ignoreDependencies: ['@sanity/bifur-client', '@sanity/browserslist-config'],
    },
  },
} satisfies KnipConfig

export const addBundlerEntries = async (config: KnipConfig): Promise<KnipConfig> => {
  const dirs = [
    'packages/@repo/config-eslint',
    'packages/@repo/config-test',
    'packages/@repo/e2e',
    'packages/@repo/tsconfig',
    'packages/@repo/package.config',
    'packages/core',
    'packages/react',
    'packages/react-internal',
    'apps/kitchensink-react',
  ]

  for (const wsDir of dirs) {
    for (const configKey of Object.keys(baseConfig.workspaces)) {
      if (match([wsDir], configKey)) {
        const manifest = await import(join(__dirname, wsDir, 'package.json'))
        const configEntries = (config?.workspaces?.[configKey].entry as string[]) ?? []
        const bundler = manifest?.bundler
        for (const value of Object.values(bundler ?? {})) {
          if (Array.isArray(value)) {
            configEntries.push(...value)
          }
        }
        // Add package.config.ts to entry points
        configEntries.push('package.config.ts')
        if (config.workspaces && config.workspaces[configKey]) {
          config.workspaces[configKey].entry = Array.from(new Set(configEntries))
        }
      }
    }
  }
  return config
}

export default addBundlerEntries(baseConfig)
