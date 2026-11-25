import {useContext} from 'react'

import {getDashboardRootContext, type ViewRootProps} from '../../dashboard/module'
import {useView} from './useView'

/**
 * Returns the asset source view and the asset source props, such as `onSelect` and `onClose`.
 *
 * Throws when the component does not render in an asset source view.
 *
 * @example
 * ```tsx
 * export default function MyAssetSource() {
 *   const {view, onClose} = useAssetSource()
 *   return <button onClick={onClose}>Close {view.title}</button>
 * }
 * ```
 *
 * @beta
 * @category Dashboard
 */
export function useAssetSource(): ViewRootProps<'asset_source'> {
  const view = useView()
  const root = useContext(getDashboardRootContext())

  if (root?.viewType !== 'asset_source') {
    throw new Error(
      `useAssetSource must be called inside an asset source view, not a ${view.surface} view`,
    )
  }

  return root.props
}
