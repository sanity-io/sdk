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

// Views listed under their application, as on `useApplications`, leave `application` out.
type MaybeApplication<WithApplication extends boolean> = WithApplication extends true
  ? {application: ViewApplication}
  : unknown

type ViewOf<
  Type extends ApplicationInterface['type'],
  Surface,
  WithApplication extends boolean,
> = Omit<InterfaceOf<Type>, 'type'> & {surface: Surface} & MaybeApplication<WithApplication>

/**
 * A view that opens as a full window.
 * @public
 * @category Types
 * @category Dashboard
 */
export type WindowView<WithApplication extends boolean = true> = ViewOf<
  'app',
  'window',
  WithApplication
>

/**
 * A view that opens as a panel from the dock.
 * @public
 * @category Types
 * @category Dashboard
 */
export type PanelView<WithApplication extends boolean = true> = ViewOf<
  'panel',
  'panel',
  WithApplication
>

/**
 * A view that renders as a tile on the dashboard.
 * @public
 * @category Types
 * @category Dashboard
 */
export type TileView<WithApplication extends boolean = true> = ViewOf<
  'tile',
  'tile',
  WithApplication
>

/**
 * A view that renders as an asset source.
 * @public
 * @category Types
 * @category Dashboard
 */
export type AssetSourceView<WithApplication extends boolean = true> = ViewOf<
  'asset_source',
  'asset_source',
  WithApplication
>

/**
 * A view exposed by an application or installation.
 * @public
 * @category Types
 * @category Dashboard
 */
export type View<WithApplication extends boolean = true> =
  | WindowView<WithApplication>
  | PanelView<WithApplication>
  | TileView<WithApplication>
  | AssetSourceView<WithApplication>

/**
 * A web worker exposed by an application or installation.
 * @public
 * @category Types
 * @category Dashboard
 */
export type WebWorker<WithApplication extends boolean = true> = InterfaceOf<'worker'> &
  MaybeApplication<WithApplication>
