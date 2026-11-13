import {type ApplicationInterface} from '@sanity/sdk'

import {useView} from './useView'

/**
 * Returns the asset source view.
 *
 * Throws when the component does not render in an asset source view.
 *
 * @example
 * ```tsx
 * export default function MyAssetSource() {
 *   const {view} = useAssetSource()
 *   return <p>{view.title}</p>
 * }
 * ```
 *
 * @public
 * @category Dashboard
 */
export function useAssetSource(): {view: Extract<ApplicationInterface, {type: 'asset_source'}>} {
  const view = useView()

  if (view.type !== 'asset_source') {
    throw new Error(
      `useAssetSource must be called inside an asset source view, not a ${view.type} view`,
    )
  }

  return {view}
}
