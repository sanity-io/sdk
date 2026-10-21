import {createActionBinder} from '../../store/createActionBinder'
import {defineStore} from '../../store/defineStore'
import {type MessageBusEmitOptions, workerMessages} from './bus'
import {requireDashboardMessageBus} from './store'

/**
 * A view's client for one of its own application's workers, before `useWorker` types it.
 * @internal
 */
export interface WorkerConnection {
  post(payload?: unknown, options?: MessageBusEmitOptions): Promise<unknown>
  subscribe(handler: (message: unknown) => void): () => void
}

interface DashboardWorkersState {
  workers: {[name: string]: WorkerConnection}
}

const bindActionByInstance = createActionBinder<{name: string}, [name: string]>((instance) => ({
  name: instance.instanceId,
}))

const dashboardWorkersStore = defineStore<DashboardWorkersState>({
  name: 'dashboardWorkers',
  getInitialState: () => ({workers: {}}),
})

/**
 * Returns the instance's client for one of its application's workers, creating it on first call.
 *
 * @remarks
 * The client lives with the instance rather than a component, so a render that suspended before
 * committing gets the same client when it renders again, and callers can key caches on it.
 * @internal
 */
export const getWorkerClient = bindActionByInstance(
  dashboardWorkersStore,
  ({instance, state}, name: string): WorkerConnection => {
    const current = state.get().workers[name]
    if (current) return current
    const messageBus = requireDashboardMessageBus(instance, `use worker "${name}"`)
    const client: WorkerConnection = {
      post: (payload, options) =>
        // Inside the executor, so a closed bus rejects instead of throwing.
        new Promise((resolve) =>
          resolve(messageBus.emit('workers.post', {name, payload}, options)),
        ),
      subscribe: (handler) => {
        const subscription = workerMessages(messageBus, name).subscribe(handler)
        return () => subscription.unsubscribe()
      },
    }
    state.set('addWorker', ({workers}) => ({workers: {...workers, [name]: client}}))
    return client
  },
)
