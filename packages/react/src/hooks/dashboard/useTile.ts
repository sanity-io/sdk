import {type TileView} from '@sanity/sdk/dashboard'

import {useViewRoot} from './useView'

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
  const root = useViewRoot()

  if (root.viewType !== 'tile') {
    throw new Error(`useTile must be called inside a tile view, not a ${root.viewType} view`)
  }

  return root.props
}
