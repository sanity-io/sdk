import {type ApplicationInterface} from '@sanity/sdk'
import {useContext} from 'react'

import {getDashboardRootContext} from '../../dashboard/module'
import {useView} from './useView'

/**
 * Returns the panel view and onClose handler.
 *
 * Throws when the component does not render in a panel view.
 *
 * @example
 * ```tsx
 * export default function MyPanel() {
 *   const {view, onClose} = usePanel()
 *   return (
 *     <header>
 *       <h2>{view.title}</h2>
 *       <button onClick={onClose}>Close</button>
 *     </header>
 *   )
 * }
 * ```
 *
 * @public
 * @category Dashboard
 */
export function usePanel(): {
  view: Extract<ApplicationInterface, {type: 'panel'}>
  onClose: () => void
} {
  const view = useView()
  const root = useContext(getDashboardRootContext())

  if (root?.viewType !== 'panel') {
    throw new Error(`usePanel must be called inside a panel view, not a ${view.type} view`)
  }

  return root.props
}
