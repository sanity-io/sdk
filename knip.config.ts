import {KnipConfig} from 'knip'
import {join} from 'node:path'
import {match} from 'minimatch'

const project = ['src/**/*.{js,jsx,ts,tsx}', '!**/build/**', '!**/docs/**']

const baseConfig = {
  workspaces: {
    '.': {
      entry: ['package.config.ts'],
    },
    'apps/kitchensink-react': {
      entry: ['src/main.tsx'],
      project,
    },
    'packages/react': {
      entry: ['src/css/css.config.js'],
      project,
    },
    'packages/*': {
      project,
    },
    'apps/*': {
      project,
    },
  },
} satisfies KnipConfig

export const addBundlerEntries = async (config: KnipConfig) => {
  const dirs = [
    'packages/@repo/config-eslint',
    'packages/@repo/package.config',
    'packages/core',
    'packages/react',
    'apps/kitchensink-react',
    'apps/storybook',
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
