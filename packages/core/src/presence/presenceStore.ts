// Import types and functions needed for the interview exercise
// TODO: You'll need to use these imports in your implementation
// import {type SanityClient} from '@sanity/client'
// import {createSelector} from 'reselect'
import {Subject} from 'rxjs'

// TODO: Uncomment and use these imports in your implementation
// import {type SanityClient} from '@sanity/client'
// import {createSelector} from 'reselect'
// import {Subscription, distinctUntilChanged} from 'rxjs'
// import {getTokenState} from '../auth/authStore'
// import {getClient} from '../client/clientStore'
// import {createBifurTransport} from './bifurTransport'
// import {type TransportEvent} from './types'
import {bindActionByDataset} from '../store/createActionBinder'
import {createStateSourceAction} from '../store/createStateSourceAction'
import {defineStore, type StoreContext} from '../store/defineStore'
import {type PresenceLocation} from './types'

export type PresenceStoreState = {
  locations: Map<string, PresenceLocation[]>
  reportPresence$: Subject<PresenceLocation[]>
}

const getInitialState = (): PresenceStoreState => ({
  locations: new Map<string, PresenceLocation[]>(),
  reportPresence$: new Subject<PresenceLocation[]>(),
})

/**
 * @public
 *
 * TODO: Complete the presence store implementation
 *
 * Implementation needs:
 * - Initialize the store with proper presence location management
 * - Set up transport layer for real-time presence updates
 * - Handle incoming presence events (state, disconnect)
 * - Manage session-based presence locations
 * - Subscribe to reportPresence$ Subject for outgoing presence updates
 * - Return cleanup function for proper resource management
 *
 * Available functions: createBifurTransport, getTokenState, getClient
 * See bifurTransport.ts for transport implementation details
 */
export const presenceStore = defineStore<PresenceStoreState>({
  name: 'presence',
  getInitialState,
  initialize: (context: StoreContext<PresenceStoreState>) => {
    // TODO: Implement store initialization logic here
    // This is a placeholder implementation
    // eslint-disable-next-line no-console
    console.warn('presenceStore initialization not yet implemented')

    // Suppress unused variable warning
    void context

    // Return a cleanup function (required by the store interface)
    return () => {
      // TODO: Implement cleanup logic
    }
  },
})

// TODO: Implement selector to get locations from state
// const selectLocations = (state: PresenceStoreState) => state.locations

// TODO: Implement selector to flatten all presence locations
// TODO: Uncomment and use this selector in getPresenceLocations
// const _selectPresenceLocations = createSelector(selectLocations, (_locations) => {
//   // TODO: Implement logic to flatten locations from all sessions
//   return []
// })

/**
 * @public
 *
 * TODO: Complete getPresenceLocations function
 *
 * Implementation needs:
 * - Return a StateSource that provides current presence locations
 * - Should aggregate locations from all active sessions
 * - Must be bound to dataset context
 */
export const getPresenceLocations = bindActionByDataset(
  presenceStore,
  createStateSourceAction((_context) => {
    // TODO: Implement presence locations retrieval
    // eslint-disable-next-line no-console
    console.warn('getPresenceLocations not yet implemented')
    return []
  }),
)

/**
 * @public
 *
 * TODO: Complete reportPresence function
 *
 * Implementation needs:
 * - Accept locations: PresenceLocation[] parameter
 * - Send presence locations to the reportPresence$ Subject
 * - Must be bound to dataset context
 */
export const reportPresence = bindActionByDataset(
  presenceStore,
  (_context, _locations: PresenceLocation[]) => {
    // TODO: Implement presence reporting logic
    // eslint-disable-next-line no-console
    console.warn('reportPresence not yet implemented')
  },
)
