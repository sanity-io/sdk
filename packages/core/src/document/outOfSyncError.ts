// An inline `type` import still loads listen.ts, whose subclasses extend this one before it exists
// eslint-disable-next-line import-x/consistent-type-specifier-style
import type {ListenerSequenceState} from './listen'

export class OutOfSyncError extends Error {
  /**
   * Attach state to the error for debugging/reporting
   */
  state: ListenerSequenceState
  constructor(message: string, state: ListenerSequenceState) {
    super(message)
    this.name = 'OutOfSyncError'
    this.state = state
  }
}
