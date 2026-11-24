import {type ApplicationBase} from '../applications/applications'

/**
 * Where a window view appears in the dock.
 * @public
 * @category Types
 * @category Dashboard
 */
export type Dock = {
  group?: 'system' | 'applications'
  order?: number
}

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

type InterfaceBase = {
  id: string
  name: string
  title: string
  version: string
  /** Module federation module id, unqualified, as stored on the interface. */
  moduleId: string
  application: ViewApplication
}

/**
 * A view that opens as a full window.
 * @public
 * @category Types
 * @category Dashboard
 */
export type WindowView = InterfaceBase & {
  surface: 'window'
  metadata: {
    dock?: Dock
    /** `cdn.sanity.io` URL. Overrides the application icon in the dock. */
    icon?: string
  } | null
}

/**
 * A view that opens as a panel from the dock.
 * @public
 * @category Types
 * @category Dashboard
 */
export type PanelView = InterfaceBase & {
  surface: 'panel'
  metadata: {
    dock?: Pick<Dock, 'order'>
    /** `cdn.sanity.io` URL. Overrides the application icon in the dock. */
    icon?: string
  } | null
}

/**
 * A view that renders as a tile on the dashboard.
 * @public
 * @category Types
 * @category Dashboard
 */
export type TileView = InterfaceBase & {
  surface: 'tile'
  metadata: {order?: number; size: 'small' | 'large' | 'banner'}
}

/**
 * A view that renders as an asset source.
 * @public
 * @category Types
 * @category Dashboard
 */
export type AssetSourceView = InterfaceBase & {
  surface: 'asset_source'
  metadata: null
}

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
export type WebWorker = InterfaceBase & {
  type: 'worker'
  metadata: null
}
