import {type ApplicationBase, type ApplicationInterface} from '@sanity/sdk'
import {useMemo} from 'react'

import {type RemoteModuleRef, type ValueOf} from '../../dashboard/messageBus/topics'
import {useTopic, type UseTopicOptions, type UseTopicResult} from './useTopic'

type DashboardInterfaceBase = Omit<ApplicationInterface, 'metadata' | 'type'>
type DashboardApplicationInterface = DashboardInterfaceBase &
  (
    | {type: 'app'; metadata: {dock?: {group?: string; order?: number}} | null}
    | {type: 'panel'; metadata: {dock?: {group?: string; order?: number}} | null}
    | {type: 'asset_source'; metadata: null}
    | {type: 'worker'; metadata: null}
    | {type: 'tile'; metadata: {order?: number; size: 'small' | 'large' | 'banner'}}
  )
type DashboardTopicApplication = ApplicationBase & {
  activeDeployment?: {interfaces?: DashboardApplicationInterface[]} | null
  config?: {mfManifest?: unknown}
}
type ViewInterface = Exclude<DashboardApplicationInterface, {type: 'worker'}>

/**
 * A dashboard view exposed by an application.
 * @public
 */
export type View = {
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
export type WebWorker = Extract<DashboardApplicationInterface, {type: 'worker'}> & {
  readonly application: ApplicationBase
  readonly module: RemoteModuleRef
}

/**
 * The minimal Brett application fields with its loadable views and web workers.
 * @public
 */
export type Application = ApplicationBase & {
  readonly views: View[]
  readonly webWorkers: WebWorker[]
}

type TopicState<T> = UseTopicResult<T, false>
type SanityGlobal = typeof globalThis & {__SANITY_STAGING__?: boolean}

const mapTopicState = <T, U>(result: TopicState<T>, map: (data: T) => U): TopicState<U> =>
  result.isPending ? result : {data: map(result.data), isPending: false}

const applicationOrigin = (application: ApplicationBase): string => {
  if (application.externalUrl !== null) return new URL(application.externalUrl).origin
  if (application.slug === null) throw new Error(`Application ${application.id} has no URL`)

  const staging = (globalThis as SanityGlobal).__SANITY_STAGING__ === true
  const domain = staging ? 'run.sanity.work' : 'sanity.run'
  return `https://${application.slug}-apps-${application.organizationId}.${domain}`
}

const remoteModuleRef = (
  application: ApplicationBase,
  extension: Pick<DashboardApplicationInterface, 'moduleId' | 'version'>,
): RemoteModuleRef => ({
  entry: new URL('/mf-manifest.json', applicationOrigin(application)).href,
  moduleId: `${application.id}/${extension.moduleId}`,
  version: extension.version,
})

const isView = (extension: DashboardApplicationInterface): extension is ViewInterface =>
  extension.type !== 'worker'

const toView = (application: ApplicationBase, extension: ViewInterface): View => {
  const {type, ...view} = extension
  return {
    ...view,
    application,
    module: remoteModuleRef(application, extension),
    surface: type === 'app' ? 'window' : type,
  } as View
}

const toWebWorker = (
  application: ApplicationBase,
  extension: Extract<DashboardApplicationInterface, {type: 'worker'}>,
): WebWorker => ({
  ...extension,
  application,
  module: remoteModuleRef(application, extension),
})

const toApplication = (application: DashboardTopicApplication): Application => {
  const {activeDeployment, config, ...applicationBase} = application
  const interfaces = config?.mfManifest === undefined ? [] : (activeDeployment?.interfaces ?? [])
  const views: View[] = []
  const webWorkers: WebWorker[] = []

  for (const extension of interfaces) {
    if (isView(extension)) views.push(toView(applicationBase, extension))
    else webWorkers.push(toWebWorker(applicationBase, extension))
  }

  return {...applicationBase, views, webWorkers}
}

const applicationsFromTopic = (topic: ValueOf<'applications.list'>): Application[] => {
  if (topic === null) return []
  if (!topic.ok) throw new Error('The dashboard failed to load applications')
  return topic.value.map((application) => toApplication(application as DashboardTopicApplication))
}

/**
 * Returns the applications available in the dashboard.
 *
 * Pass `{suspend: false}` to receive a pending result instead of suspending.
 * @public
 */
export function useApplications<Suspend extends boolean = true>(
  options: UseTopicOptions<Suspend> = {},
): UseTopicResult<Application[], Suspend> {
  const result = useTopic('applications.list', options)
  return useMemo(() => mapTopicState(result, applicationsFromTopic), [result]) as UseTopicResult<
    Application[],
    Suspend
  >
}
