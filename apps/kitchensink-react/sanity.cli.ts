import {defineCliConfig} from 'sanity/cli'
import {
  type ConfigEnv,
  type Plugin,
  type PluginOption,
  type UserConfig,
  type UserConfigExport,
} from 'vite'

export default defineCliConfig({
  app: {
    organizationId: 'oblZgbTFj',
    entry: './src/App.tsx',
    id: 'wkyoigmzawwnnwx458zgoh46',
  },
  // Extend Sanity CLI's internal Vite config with the app's Vite config
  vite: async (prev: UserConfig) => {
    const {default: viteConfigFactory} = (await import('./vite.config.mjs')) as {
      default: UserConfigExport
    }

    const mode = process.env['NODE_ENV'] === 'production' ? 'production' : 'development'
    const command: ConfigEnv['command'] = mode === 'production' ? 'build' : 'serve'
    const env: ConfigEnv = {mode, command}

    const projectConfigMaybe =
      typeof viteConfigFactory === 'function' ? viteConfigFactory(env) : viteConfigFactory
    const projectConfig = (await Promise.resolve(projectConfigMaybe)) as UserConfig

    // Merge plugins without duplicates and avoid double React Refresh injection
    const flattenPlugins = (
      input: PluginOption | PluginOption[] | undefined,
    ): import('vite').Plugin[] => {
      const result: import('vite').Plugin[] = []
      const push = (value: unknown) => {
        if (!value) return
        if (Array.isArray(value)) {
          value.forEach(push)
          return
        }
        const maybe = value as Partial<Plugin>
        if (typeof maybe === 'object' && maybe && 'name' in maybe) {
          result.push(maybe as Plugin)
        }
      }
      push(input as unknown)
      return result
    }

    const prevPlugins = flattenPlugins(prev.plugins)
    const projectPlugins = flattenPlugins(projectConfig.plugins)

    const projectHasReact = projectPlugins.some((p) => /react|refresh/i.test(p.name))
    const filteredPrev = projectHasReact
      ? prevPlugins.filter((p) => !/react|refresh/i.test(p.name))
      : prevPlugins

    const seen = new Set<string>()
    const mergedPlugins = [...projectPlugins, ...filteredPrev].filter((p) => {
      if (!p.name) return true
      if (seen.has(p.name)) return false
      seen.add(p.name)
      return true
    })

    return {
      ...prev,
      ...projectConfig,
      plugins: mergedPlugins,
      resolve: {
        ...prev.resolve,
        ...projectConfig.resolve,
        alias: {
          ...(prev.resolve?.alias ?? {}),
          ...(projectConfig.resolve?.alias ?? {}),
        },
      },
      define: {
        ...prev.define,
        ...(projectConfig.define ?? {}),
      },
      server: {
        ...prev.server,
        ...(projectConfig.server ?? {}),
      },
    }
  },
})
