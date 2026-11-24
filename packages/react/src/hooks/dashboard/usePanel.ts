import {type PanelView} from '@sanity/sdk/dashboard'

import {type TopicEmitter, useEmit} from './useEmit'
import {useViewRoot} from './useView'

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
export function usePanel(): {
  view: PanelView
  onClose: () => void
  setMode: TopicEmitter<'panels.mode.set'>
} {
  const root = useViewRoot()

  if (root.viewType !== 'panel') {
    throw new Error(`usePanel must be called inside a panel view, not a ${root.viewType} view`)
  }

  const setMode = useEmit('panels.mode.set')

  return {...root.props, setMode}
}
