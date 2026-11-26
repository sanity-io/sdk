import {getApplicationOrigin} from '../applications/applicationOrigin'
import {type ApplicationBase, type ApplicationInterface} from '../applications/applications'
import {type Installation, type InstallationInclude} from '../installations/installations'
import {type RemoteModuleRef, type ValueOf} from './messageBus/topics'
import {type View, type WebWorker} from './views'

type DashboardTopicEntry = Extract<
  NonNullable<ValueOf<'applications.list'>>,
  {ok: true}
>['value'][number]
// The published union distinguishes an `Application` (has `type`) from an `Installation` (has not).
type DashboardTopicApplication = Extract<DashboardTopicEntry, {type: unknown}>
type DashboardTopicInstallation = Exclude<DashboardTopicEntry, {type: unknown}>

/**
 * The shared identity fields of each {@link DashboardApplication}, and the input to module
 * loading. Widens {@link ApplicationBase} so `type` also covers installations.
 * @beta
 * @category Types
 * @category Dashboard
 */
export type DashboardApplicationBase = Omit<ApplicationBase, 'type'> & {
  readonly type: ApplicationBase['type'] | 'installation'
  /** Served by a CLI dev server rather than a deployment. */
  readonly isLocal: boolean
}

/**
 * An installation shaped into the shared application base, with its raw record kept under
 * `installation` for consumers that need the full record.
 * @beta
 * @category Types
 * @category Dashboard
 */
export type DashboardInstallation = Omit<DashboardApplicationBase, 'type'> & {
  readonly type: 'installation'
  readonly installation: Installation<InstallationInclude>
}

/**
 * A dashboard entry — an application or an installation — in one consistent shape, with its
 * loadable views and web workers. `type` distinguishes the kinds and `isLocal` marks dev-server
 * applications; render a list without branching.
 * @beta
 * @category Types
 * @category Dashboard
 */
export type DashboardApplication = (DashboardTopicApplication | DashboardInstallation) &
  Pick<DashboardApplicationBase, 'isLocal'> & {
    readonly views: (View<{includeApplication: false}> & {readonly module: RemoteModuleRef})[]
    readonly webWorkers: (WebWorker<{includeApplication: false}> & {
      readonly module: RemoteModuleRef
    })[]
  }

// Only a federated deployment (one with a module federation manifest) exposes loadable modules.
// A dev server is always federated, whether or not the workbench synthesised a manifest for it.
const loadableInterfaces = (
  {activeDeployment, config}: DashboardTopicApplication,
  isLocal: boolean,
): readonly ApplicationInterface[] =>
  isLocal || config?.mfManifest !== undefined ? (activeDeployment?.interfaces ?? []) : []

// Turns an interface list into views and web workers loaded from `base`'s origin.
const loadModules = (
  base: DashboardApplicationBase,
  interfaces: readonly ApplicationInterface[],
): Pick<DashboardApplication, 'views' | 'webWorkers'> => {
  // Nothing to load without interfaces or an origin to load them from.
  const entry = interfaces.length === 0 ? null : getApplicationOrigin(base)
  if (entry === null) return {views: [], webWorkers: []}

  const views: DashboardApplication['views'] = []
  const webWorkers: DashboardApplication['webWorkers'] = []

  for (const extension of interfaces) {
    const module: RemoteModuleRef = {
      entry,
      moduleId: `${base.id}/${extension.moduleId}`,
      version: extension.version,
    }

    if (extension.type === 'worker') {
      webWorkers.push({...extension, module})
      continue
    }

    const {type, ...view} = extension
    // TS can't correlate `surface` with the narrowed `type` across the union.
    views.push({
      ...view,
      surface: type === 'app' ? 'window' : type,
      module,
    } as DashboardApplication['views'][number])
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
  // `getApplicationOrigin`'s singleton branch (`https://<slug>--apps--<publisherOrgId>.sanity.run`).
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
 * Shapes the dashboard's published applications and installations into {@link DashboardApplication}s,
 * the entries `useApplications` returns.
 * @beta
 * @category Dashboard
 */
export function toDashboardApplications(
  entries: readonly DashboardTopicEntry[],
): DashboardApplication[] {
  return entries.map((entry) => ('type' in entry ? toApplication(entry) : toInstallation(entry)))
}
