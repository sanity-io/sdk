import {type CliConfig, defineCliConfig} from 'sanity/cli'

type VitePlugin = {name?: string}
type VitePluginOption = VitePlugin | false | null | undefined | VitePluginOption[]

const flattenPlugins = (input: VitePluginOption | VitePluginOption[] | undefined): VitePlugin[] => {
  const result: VitePlugin[] = []
  const push = (value: VitePluginOption) => {
    if (!value) return
    if (Array.isArray(value)) {
      value.forEach(push)
      return
    }
    if (typeof value === 'object' && 'name' in value) {
      result.push(value)
    }
  }
  push(input as VitePluginOption)
  return result
}

const vite = (async (prev) => {
  const {default: viteConfigFactory} = (await import('./vite.config.mjs')) as {
    default:
      | Record<string, unknown>
      | ((env: {mode: string; command: 'build' | 'serve'}) => Record<string, unknown>)
  }

  const mode = process.env['NODE_ENV'] === 'production' ? 'production' : 'development'
  const command = (mode === 'production' ? 'build' : 'serve') as 'build' | 'serve'
  const env = {mode, command}

  const projectConfigMaybe =
    typeof viteConfigFactory === 'function' ? viteConfigFactory(env) : viteConfigFactory
  const projectConfig = await Promise.resolve(projectConfigMaybe)

  const prevPlugins = flattenPlugins(
    prev.plugins as VitePluginOption | VitePluginOption[] | undefined,
  )
  const projectPlugins = flattenPlugins(
    projectConfig['plugins'] as VitePluginOption | VitePluginOption[] | undefined,
  )

  const projectHasReact = projectPlugins.some((p) => /react|refresh/i.test(p.name ?? ''))
  const filteredPrev = projectHasReact
    ? prevPlugins.filter((p) => !/react|refresh/i.test(p.name ?? ''))
    : prevPlugins

  const seen = new Set<string>()
  const mergedPlugins = [...projectPlugins, ...filteredPrev].filter((p) => {
    if (!p.name) return true
    if (seen.has(p.name)) return false
    seen.add(p.name)
    return true
  })

  const prevResolve = prev.resolve as Record<string, unknown> | undefined
  const projectResolve = projectConfig['resolve'] as Record<string, unknown> | undefined

  return {
    ...prev,
    ...projectConfig,
    plugins: mergedPlugins,
    resolve: {
      ...prevResolve,
      ...projectResolve,
      alias: {
        ...((prevResolve?.['alias'] as Record<string, unknown> | undefined) ?? {}),
        ...((projectResolve?.['alias'] as Record<string, unknown> | undefined) ?? {}),
      },
    },
    define: {
      ...(prev.define as Record<string, unknown> | undefined),
      ...((projectConfig['define'] as Record<string, unknown> | undefined) ?? {}),
    },
    server: {
      ...(prev.server as Record<string, unknown> | undefined),
      ...((projectConfig['server'] as Record<string, unknown> | undefined) ?? {}),
    },
  }
}) as NonNullable<CliConfig['vite']>

export default defineCliConfig({
  app: {
    // Use e2e organization ID if provided, otherwise use dev organization ID
    organizationId: process.env['SDK_E2E_ORGANIZATION_ID'] || 'oblZgbTFj',
    entry: './src/App.tsx',
    id: 'wkyoigmzawwnnwx458zgoh46',
  },
  // Extend Sanity CLI's internal Vite config with the app's Vite config
  vite,
})
