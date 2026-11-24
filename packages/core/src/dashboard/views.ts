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

type ViewOf<Type extends ApplicationInterface['type'], Surface> = Omit<
  InterfaceOf<Type>,
  'type'
> & {
  surface: Surface
  application: ViewApplication
}

/**
 * A view that opens as a full window.
 * @public
 * @category Types
 * @category Dashboard
 */
export type WindowView = ViewOf<'app', 'window'>

/**
 * A view that opens as a panel from the dock.
 * @public
 * @category Types
 * @category Dashboard
 */
export type PanelView = ViewOf<'panel', 'panel'>

/**
 * A view that renders as a tile on the dashboard.
 * @public
 * @category Types
 * @category Dashboard
 */
export type TileView = ViewOf<'tile', 'tile'>

/**
 * A view that renders as an asset source.
 * @public
 * @category Types
 * @category Dashboard
 */
export type AssetSourceView = ViewOf<'asset_source', 'asset_source'>

/**
 * A view exposed by an application or installation.
 * @public
 * @category Types
 * @category Dashboard
 */
export type View = WindowView | PanelView | TileView | AssetSourceView

/**
 * A web worker exposed by an application or installation.
 * @public
 * @category Types
 * @category Dashboard
 */
export type WebWorker = InterfaceOf<'worker'> & {application: ViewApplication}
