import {type TileView} from '@sanity/sdk/dashboard'
import {useContext} from 'react'

import {getDashboardRootContext} from '../../dashboard/module'
import {useView} from './useView'

/**
 * Returns the tile view.
 *
 * Throws when the component does not render in a tile view.
 *
 * @example
 * ```tsx
 * export default function MyTile() {
 *   const {view} = useTile()
 *   return <p>{view.metadata.size}</p>
 * }
 * ```
 *
 * @public
 * @category Dashboard
 */
export function useTile(): {view: TileView} {
  const view = useView()
  const root = useContext(getDashboardRootContext())

  if (root?.viewType !== 'tile') {
    throw new Error(`useTile must be called inside a tile view, not a ${view.surface} view`)
  }

  return root.props
}
