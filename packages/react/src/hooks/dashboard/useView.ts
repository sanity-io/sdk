import {type AssetSourceView, type PanelView, type TileView} from '@sanity/sdk/dashboard'
import {useContext, useMemo} from 'react'

import {getDashboardRootContext} from '../../dashboard/module'
import {toView} from '../../dashboard/toView'

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
 * @public
 * @category Dashboard
 */
export function useView(): PanelView | TileView | AssetSourceView {
  const root = useContext(getDashboardRootContext())
  const hostView = root?.viewType ? root.props.view : undefined
  const view = useMemo(() => hostView && toView(hostView), [hostView])

  if (!view) {
    throw new Error('useView must be called inside a Dashboard view')
  }

  return view
}
