import {type ApplicationBase} from '@sanity/sdk'
import {type RemoteModuleRef, type ValueOf} from '@sanity/sdk/dashboard'
import {useMemo} from 'react'

import {useTopic} from './useTopic'

type DashboardTopicApplication = Extract<
  NonNullable<ValueOf<'applications.list'>>,
  {ok: true}
>['value'][number]
type DashboardApplicationInterface = NonNullable<
  NonNullable<DashboardTopicApplication['activeDeployment']>['interfaces']
>[number]
type ViewInterface = Exclude<DashboardApplicationInterface, {type: 'worker'}>

/**
 * A dashboard view exposed by an application.
 * @public
 */
export type DashboardView = {
  [Type in ViewInterface['type']]: Omit<Extract<ViewInterface, {type: Type}>, 'type'> & {
    readonly application: ApplicationBase
    readonly module: RemoteModuleRef
    readonly surface: Type extends 'app' ? 'window' : Type
  }
}[ViewInterface['type']]

/**
 * A web worker exposed by an application.
 * @public
 */
export type DashboardWebWorker = Extract<DashboardApplicationInterface, {type: 'worker'}> & {
  readonly application: ApplicationBase
  readonly module: RemoteModuleRef
}

/**
 * The minimal Brett application fields with its loadable views and web workers.
 * @public
 */
export type DashboardApplication = ApplicationBase & {
  readonly views: DashboardView[]
  readonly webWorkers: DashboardWebWorker[]
}

type SanityGlobal = typeof globalThis & {__SANITY_STAGING__?: boolean}

// `null` when neither address exists: the caller exposes no modules for that application
// rather than failing the whole list on one bad record.
const applicationOrigin = (application: ApplicationBase): string | null => {
  if (application.externalUrl !== null) return new URL(application.externalUrl).origin
  if (application.slug === null) return null

  // Read at runtime, not via a bundler define: a remote is built once and runs in whichever
  // host page loaded it, and the host sets this flag. Mirrors workbench's `getSanityEnv`.
  const staging = (globalThis as SanityGlobal).__SANITY_STAGING__ === true
  if (application.isSingleton) {
    const domain = staging ? 'run.sanity.work' : 'sanity.run'
    return `https://${application.slug}-apps-${application.organizationId}.${domain}`
  }

  const domain = staging ? 'studio.sanity.work' : 'sanity.studio'
  return `https://${application.slug}.${domain}`
}

// Only a federated deployment (one with a module federation manifest) exposes loadable modules.
const loadableInterfaces = ({
  activeDeployment,
  config,
}: DashboardTopicApplication): readonly DashboardApplicationInterface[] =>
  config?.mfManifest === undefined ? [] : (activeDeployment?.interfaces ?? [])

const toApplication = (application: DashboardTopicApplication): DashboardApplication => {
  const {activeDeployment: _activeDeployment, config: _config, ...applicationBase} = application
  const interfaces = loadableInterfaces(application)
  // Nothing to load without interfaces or an origin to load them from.
  const entry = interfaces.length === 0 ? null : applicationOrigin(applicationBase)
  if (entry === null) return {...applicationBase, views: [], webWorkers: []}

  const views: DashboardView[] = []
  const webWorkers: DashboardWebWorker[] = []

  for (const extension of interfaces) {
    const module: RemoteModuleRef = {
      entry,
      moduleId: `${applicationBase.id}/${extension.moduleId}`,
      version: extension.version,
    }

    if (extension.type === 'worker') {
      webWorkers.push({...extension, application: applicationBase, module})
      continue
    }

    const {type, ...view} = extension
    // TS cannot correlate `surface` with the narrowed `type` across the mapped union; the
    // cast is checked by the `DashboardView` mapping above and the surface assertions in the tests.
    views.push({
      ...view,
      application: applicationBase,
      module,
      surface: type === 'app' ? 'window' : type,
    } as DashboardView)
  }

  return {...applicationBase, views, webWorkers}
}

/**
 * Returns the applications available in the dashboard.
 *
 * Suspends until the dashboard publishes its application list; a cleared list is empty. Throws a
 * `TopicError` to the nearest error boundary when the dashboard fails to load applications.
 *
 * @example
 * ```tsx
 * function Applications() {
 *   const applications = useApplications()
 *   return applications.map((application) => <div key={application.id}>{application.title}</div>)
 * }
 * ```
 *
 * @public
 */
export function useApplications(): DashboardApplication[] {
  const applications = useTopic('applications.list')
  return useMemo(() => applications?.map(toApplication) ?? [], [applications])
}
