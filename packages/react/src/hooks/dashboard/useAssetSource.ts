import {type AssetSourceView} from '@sanity/sdk/dashboard'
import {type AssetSourceComponentProps} from '@sanity/types'

import {useViewRoot} from './useView'

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
 * @public
 * @category Dashboard
 */
export function useAssetSource(): AssetSourceComponentProps & {view: AssetSourceView} {
  const root = useViewRoot()

  if (root.viewType !== 'asset_source') {
    throw new Error(
      `useAssetSource must be called inside an asset source view, not a ${root.viewType} view`,
    )
  }

  return root.props
}
