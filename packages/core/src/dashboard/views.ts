import {type ApplicationBase, type ApplicationInterface} from '../applications/applications'

/**
 * The application or installation a view or web worker belongs to.
 * @public
 * @category Types
 * @category Dashboard
 */
export type ViewApplication = Pick<
  ApplicationBase,
  'id' | 'name' | 'title' | 'reference' | 'icon' | 'slug' | 'organizationId'
> & {
  type: ApplicationBase['type'] | 'installation'
  /** Served by a CLI dev server rather than a deployment. */
  isLocal: boolean
}

type InterfaceOf<Type extends ApplicationInterface['type']> = Extract<
  ApplicationInterface,
  {type: Type}
>

// `{includeApplication: false}` leaves `application` out, for views listed under their application.
type ViewOptions = {includeApplication: boolean}

type MaybeApplication<Options extends ViewOptions> = Options['includeApplication'] extends true
  ? {application: ViewApplication}
  : unknown

/**
 * A view exposed by an application or installation: an interface record with its `type` as
 * `surface`, where `app` is `window`. Every interface type except `worker` is a view.
 * @public
 * @category Types
 * @category Dashboard
 */
export type View<Options extends ViewOptions = {includeApplication: true}> = {
  [Type in Exclude<ApplicationInterface['type'], 'worker'>]: Omit<InterfaceOf<Type>, 'type'> & {
    surface: Type extends 'app' ? 'window' : Type
  } & MaybeApplication<Options>
}[Exclude<ApplicationInterface['type'], 'worker'>]

/**
 * A view that opens as a full window.
 * @public
 * @category Types
 * @category Dashboard
 */
export type WindowView<Options extends ViewOptions = {includeApplication: true}> = Extract<
  View<Options>,
  {surface: 'window'}
>

/**
 * A view that opens as a panel from the dock.
 * @public
 * @category Types
 * @category Dashboard
 */
export type PanelView<Options extends ViewOptions = {includeApplication: true}> = Extract<
  View<Options>,
  {surface: 'panel'}
>

/**
 * A view that renders as a tile on the dashboard.
 * @public
 * @category Types
 * @category Dashboard
 */
export type TileView<Options extends ViewOptions = {includeApplication: true}> = Extract<
  View<Options>,
  {surface: 'tile'}
>

/**
 * A view that renders as an asset source.
 * @public
 * @category Types
 * @category Dashboard
 */
export type AssetSourceView<Options extends ViewOptions = {includeApplication: true}> = Extract<
  View<Options>,
  {surface: 'asset_source'}
>

/**
 * A web worker exposed by an application or installation.
 * @public
 * @category Types
 * @category Dashboard
 */
export type WebWorker<Options extends ViewOptions = {includeApplication: true}> =
  InterfaceOf<'worker'> & MaybeApplication<Options>
