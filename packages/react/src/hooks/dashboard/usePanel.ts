import {useContext} from 'react'

import {type DashboardViewRoot, getDashboardRootContext} from '../../dashboard/module'
import {type TopicEmitter, useEmit} from './useEmit'
import {useView} from './useView'

/**
 * Returns the panel view, the onClose handler, and setMode, which sends `panels.mode.set`.
 *
 * Throws when the component does not render in a panel view, or outside a `ResourceProvider`.
 *
 * @example
 * ```tsx
 * export default function MyPanel() {
 *   return (
 *     <ResourceProvider fallback={null}>
 *       <PanelHeader />
 *     </ResourceProvider>
 *   )
 * }
 *
 * function PanelHeader() {
 *   const {view, onClose, setMode} = usePanel()
 *   return (
 *     <header>
 *       <h2>{view.title}</h2>
 *       <button onClick={() => setMode({name: view.name, mode: 'full'})}>Expand</button>
 *       <button onClick={onClose}>Close</button>
 *     </header>
 *   )
 * }
 * ```
 *
 * @public
 * @category Dashboard
 */
export function usePanel(): Extract<DashboardViewRoot, {viewType: 'panel'}>['props'] & {
  setMode: TopicEmitter<'panels.mode.set'>
} {
  const view = useView()
  const root = useContext(getDashboardRootContext())

  if (root?.viewType !== 'panel') {
    throw new Error(`usePanel must be called inside a panel view, not a ${view.type} view`)
  }

  const setMode = useEmit('panels.mode.set')

  return {...root.props, setMode}
}
