import {type ApplicationInterface} from '../applications/applications'
import {type DashboardApplicationEntry} from './applications'
import {type RemoteModuleRef} from './messageBus/topics'

type InterfaceOf<Type extends ApplicationInterface['type']> = Extract<
  ApplicationInterface,
  {type: Type}
>

// `module` replaces `moduleId` and `version`, which are relative to the application.
type Loadable<Interface> = Readonly<Omit<Interface, 'moduleId' | 'version'>> & {
  readonly module: RemoteModuleRef
  readonly application: DashboardApplicationEntry
}

/**
 * A view exposed by an application or installation: an interface record with its `type` as
 * `surface`, where `app` is `window`. Every interface type except `worker` is a view.
 * @beta
 * @category Types
 * @category Dashboard
 */
export type View = {
  [Type in Exclude<ApplicationInterface['type'], 'worker'>]: Loadable<
    Omit<InterfaceOf<Type>, 'type'>
  > & {readonly surface: Type extends 'app' ? 'window' : Type}
}[Exclude<ApplicationInterface['type'], 'worker'>]

/**
 * A view that opens as a full window.
 * @beta
 * @category Types
 * @category Dashboard
 */
export type WindowView = Extract<View, {surface: 'window'}>

/**
 * A view that opens as a panel from the dock.
 * @beta
 * @category Types
 * @category Dashboard
 */
export type PanelView = Extract<View, {surface: 'panel'}>

/**
 * A view that renders as a tile on the dashboard.
 * @beta
 * @category Types
 * @category Dashboard
 */
export type TileView = Extract<View, {surface: 'tile'}>

/**
 * A view that renders as an asset source.
 * @beta
 * @category Types
 * @category Dashboard
 */
export type AssetSourceView = Extract<View, {surface: 'asset_source'}>

/**
 * A web worker exposed by an application or installation.
 * @beta
 * @category Types
 * @category Dashboard
 */
export type WebWorker = Loadable<InterfaceOf<'worker'>>
