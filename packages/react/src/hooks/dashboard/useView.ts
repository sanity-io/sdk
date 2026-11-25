import {type AssetSourceView, type PanelView, type TileView} from '@sanity/sdk/dashboard'
import {useContext} from 'react'

import {getDashboardRootContext} from '../../dashboard/module'

/**
 * Returns the current view.
 *
 * Throws when the component does not render in a Dashboard view.
 *
 * @example
 * ```tsx
 * function ViewTitle() {
 *   const view = useView()
 *   return <h2>{view.title}</h2>
 * }
 * ```
 *
 * @beta
 * @category Dashboard
 */
export function useView(): PanelView | TileView | AssetSourceView {
  const root = useContext(getDashboardRootContext())

  if (!root?.viewType || !root.props.view) {
    throw new Error('useView must be called inside a Dashboard view')
  }

  return root.props.view
}
