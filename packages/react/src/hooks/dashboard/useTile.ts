import {type DashboardViewRoot} from '../../dashboard/module'
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
export function useTile(): Extract<DashboardViewRoot, {viewType: 'tile'}>['props'] {
  const view = useView()

  if (view.type !== 'tile') {
    throw new Error(`useTile must be called inside a tile view, not a ${view.type} view`)
  }

  return {view}
}
