import {type StateSource} from '@sanity/sdk'
import {of} from 'rxjs'

const NEVER_ERRORS: StateSource<unknown> = {
  subscribe: () => () => {},
  getCurrent: () => undefined,
  observable: of(undefined),
}

/**
 * The error source {@link useCommentList} asks every read hook for.
 *
 * The add-on dataset store has no error state: a listener that fails throws at
 * whoever is reading it rather than parking the error beside the list. So the
 * deprecated hooks report no error, ever, and keep the behaviour they shipped
 * with.
 */
export function getNoCommentsErrorState(): StateSource<unknown> {
  return NEVER_ERRORS
}
