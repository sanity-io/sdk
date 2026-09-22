import {type ApplicationBase, type Installation, type InstallationInclude} from '@sanity/sdk'
import {getApplicationOrigin} from '@sanity/sdk/_internal'
import {type RemoteModuleRef, type ValueOf} from '@sanity/sdk/dashboard'
import {useMemo} from 'react'

import {useTopic} from './useTopic'

type DashboardTopicEntry = Extract<
  NonNullable<ValueOf<'applications.list'>>,
  {ok: true}
>['value'][number]
// The published union distinguishes an `Application` (has `type`) from an `Installation` (has not).
type DashboardTopicApplication = Extract<DashboardTopicEntry, {type: unknown}>
type DashboardTopicInstallation = Exclude<DashboardTopicEntry, {type: unknown}>
type DashboardApplicationInterface = NonNullable<
  NonNullable<DashboardTopicApplication['activeDeployment']>['interfaces']
>[number]
type ViewInterface = Exclude<DashboardApplicationInterface, {type: 'worker'}>

/**
 * The shared identity fields attached to each {@link DashboardView.application} and
 * {@link DashboardWebWorker.application}, and the input to module loading. Widens
 * {@link ApplicationBase} so `type` also covers installations.
 * @public
 */
export type DashboardApplicationBase = Omit<ApplicationBase, 'type'> & {
  readonly type: ApplicationBase['type'] | 'installation'
  /** Served by a CLI dev server rather than a deployment. */
  readonly isLocal: boolean
}

/**
 * A dashboard view exposed by an application or installation.
 * @public
 */
export type DashboardView = {
  [Type in ViewInterface['type']]: Omit<Extract<ViewInterface, {type: Type}>, 'type'> & {
    readonly application: DashboardApplicationBase
    readonly module: RemoteModuleRef
    readonly surface: Type extends 'app' ? 'window' : Type
  }
}[ViewInterface['type']]

/**
 * A web worker exposed by an application or installation.
 * @public
 */
export type DashboardWebWorker = Extract<DashboardApplicationInterface, {type: 'worker'}> & {
  readonly application: DashboardApplicationBase
  readonly module: RemoteModuleRef
}

/**
 * An installation shaped into the shared application base, with its raw record kept under
 * `installation` for consumers that need the full record.
 * @public
 */
export type DashboardInstallation = Omit<DashboardApplicationBase, 'type'> & {
  readonly type: 'installation'
  readonly installation: Installation<InstallationInclude>
}

/**
 * A dashboard entry — an application or an installation — in one consistent shape, with its
 * loadable views and web workers. `type` distinguishes the kinds and `isLocal` marks dev-server
 * applications; render a list without branching.
 * @public
 */
export type DashboardApplication = (DashboardTopicApplication | DashboardInstallation) &
  Pick<DashboardApplicationBase, 'isLocal'> & {
    readonly views: DashboardView[]
    readonly webWorkers: DashboardWebWorker[]
  }

// Only a federated deployment (one with a module federation manifest) exposes loadable modules.
// A dev server is always federated, whether or not the workbench synthesised a manifest for it.
const loadableInterfaces = (
  {activeDeployment, config}: DashboardTopicApplication,
  isLocal: boolean,
): readonly DashboardApplicationInterface[] =>
  isLocal || config?.mfManifest !== undefined ? (activeDeployment?.interfaces ?? []) : []

// Turns an interface list into views and web workers loaded from `base`'s origin. Shared by
// applications and installations so the surface mapping lives in one place.
const loadModules = (
  base: DashboardApplicationBase,
  interfaces: readonly DashboardApplicationInterface[],
): {views: DashboardView[]; webWorkers: DashboardWebWorker[]} => {
  // Nothing to load without interfaces or an origin to load them from.
  const entry = interfaces.length === 0 ? null : getApplicationOrigin(base)
  if (entry === null) return {views: [], webWorkers: []}

  const views: DashboardView[] = []
  const webWorkers: DashboardWebWorker[] = []

  for (const extension of interfaces) {
    const module: RemoteModuleRef = {
      entry,
      moduleId: `${base.id}/${extension.moduleId}`,
      version: extension.version,
    }

    if (extension.type === 'worker') {
      webWorkers.push({...extension, application: base, module})
      continue
    }

    const {type, ...view} = extension
    // TS cannot correlate `surface` with the narrowed `type` across the mapped union; the
    // cast is checked by the `DashboardView` mapping above and the surface assertions in the tests.
    views.push({
      ...view,
      application: base,
      module,
      surface: type === 'app' ? 'window' : type,
    } as DashboardView)
  }

  return {views, webWorkers}
}

const toApplication = (application: DashboardTopicApplication): DashboardApplication => {
  const {activeDeployment: _activeDeployment, config: _config, ...applicationBase} = application
  const isLocal = 'local' in application
  return {
    ...application,
    isLocal,
    ...loadModules({...applicationBase, isLocal}, loadableInterfaces(application, isLocal)),
  }
}

const toInstallation = (installation: DashboardTopicInstallation): DashboardApplication => {
  const {application} = installation
  // `id` is the installation record's id, not its `applicationId`, so two installs of one app never
  // collide. `organizationId` is the publisher's: the singleton bundle is hosted under the org that
  // published it, and `isSingleton: true` with `externalUrl: null` routes the origin through
  // `getApplicationOrigin`'s singleton branch (`https://<slug>-apps-<publisherOrgId>.sanity.run`).
  // The installing org stays on the raw record. The workbench always serves installations
  // federated, so their interfaces are never gated.
  const base: DashboardApplicationBase = {
    id: installation.id,
    type: 'installation',
    isLocal: false,
    title: application.title,
    name: application.name,
    reference: application.reference,
    icon: application.icon,
    isSingleton: true,
    visibility: 'default',
    slug: application.slug,
    externalUrl: null,
    organizationId: application.organizationId,
    createdAt: installation.createdAt,
    updatedAt: installation.updatedAt,
  }
  // The raw record rides only the entry, not every view's `application`.
  return {
    ...base,
    type: 'installation',
    installation,
    ...loadModules(base, installation.interfaces ?? []),
  }
}

/**
 * Returns the applications and installations available in the dashboard, in one consistent shape.
 *
 * Suspends until the dashboard publishes its list; a cleared list is empty. Throws a `TopicError`
 * to the nearest error boundary when the dashboard fails to load. Every entry exposes the same base
 * fields plus `views` and `webWorkers`; `type` distinguishes applications (`'studio' | 'coreApp'`)
 * from installations (`'installation'`), which also carry the raw record under `installation`.
 * `isLocal` marks applications served by a CLI dev server.
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
  return useMemo(
    () =>
      applications?.map((entry) =>
        'type' in entry ? toApplication(entry) : toInstallation(entry),
      ) ?? [],
    [applications],
  )
}
