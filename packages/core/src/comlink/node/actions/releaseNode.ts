import {type StoreContext} from '../../../store/defineStore'
import {type ComlinkNodeState} from '../comlinkNodeStore'

export const releaseNode = ({state}: StoreContext<ComlinkNodeState>, name: string): void => {
  const nodes = state.get().nodes
  const existing = nodes.get(name)

  if (existing) {
    if (existing.statusUnsub) {
      existing.statusUnsub()
    }
    existing.node.stop()
    nodes.delete(name)
    state.set('removeNode', {nodes})
    return
  }
}
