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

type SanityGlobal = typeof globalThis & {__SANITY_STAGING__?: boolean}

const applicationOrigin = (application: ApplicationBase): string => {
  if (application.externalUrl !== null) return new URL(application.externalUrl).origin
  if (application.slug === null) throw new Error(`Application ${application.id} has no URL`)

  const staging = (globalThis as SanityGlobal).__SANITY_STAGING__ === true
  if (application.isSingleton) {
    const domain = staging ? 'run.sanity.work' : 'sanity.run'
    return `https://${application.slug}-apps-${application.organizationId}.${domain}`
  }

  const domain = staging ? 'studio.sanity.work' : 'sanity.studio'
  return `https://${application.slug}.${domain}`
}

const toApplication = (application: DashboardTopicApplication): Application => {
  const {activeDeployment, config, ...applicationBase} = application
  const interfaces = config?.mfManifest === undefined ? [] : (activeDeployment?.interfaces ?? [])
  if (interfaces.length === 0) return {...applicationBase, views: [], webWorkers: []}

  const entry = applicationOrigin(applicationBase)
  const views: View[] = []
  const webWorkers: WebWorker[] = []

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
    views.push({
      ...view,
      application: applicationBase,
      module,
      surface: type === 'app' ? 'window' : type,
    } as View)
  }

  return {...applicationBase, views, webWorkers}
}

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
  return useMemo(
    () =>
      result.isPending || result.error
        ? result
        : {data: result.data?.map(toApplication) ?? [], isPending: false},
    [result],
  ) as UseTopicResult<Application[], Suspend, TopicError>
}
