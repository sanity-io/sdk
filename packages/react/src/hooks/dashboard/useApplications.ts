import {type ApplicationBase} from '@sanity/sdk'
import {useMemo} from 'react'

import {type RemoteModuleRef, type ValueOf} from '../../dashboard/messageBus/topics'
import {type TopicError, useTopic, type UseTopicOptions, type UseTopicResult} from './useTopic'

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

type TopicState<T> = UseTopicResult<T, false, TopicError>
type SanityGlobal = typeof globalThis & {__SANITY_STAGING__?: boolean}

const mapTopicState = <T, U>(result: TopicState<T>, map: (data: T) => U): TopicState<U> =>
  result.isPending || result.error ? result : {data: map(result.data), isPending: false}

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

const applicationsFromTopic = (applications: DashboardTopicApplication[] | null): Application[] =>
  applications?.map(toApplication) ?? []

/**
 * Returns the applications available in the dashboard.
 *
 * Pass `{suspend: false}` to receive a pending result instead of suspending.
 * @public
 */
export function useApplications<Suspend extends boolean = true>(
  options: UseTopicOptions<Suspend> = {},
): UseTopicResult<Application[], Suspend, TopicError> {
  const result = useTopic('applications.list', options)
  return useMemo(() => mapTopicState(result, applicationsFromTopic), [result]) as UseTopicResult<
    Application[],
    Suspend,
    TopicError
  >
}
