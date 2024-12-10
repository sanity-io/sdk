import {distinctUntilChanged, EMPTY, filter, fromEvent, map, type Observable} from 'rxjs'
import {createResourceAction} from '../../store/createResource'
import {Auth} from '../newAuthStore'
import {getTokenFromStorage} from './getTokenFromStorage'

/**
 * Creates an observable stream of storage events. If not in a browser environment,
 * returns an EMPTY observable.
 */
function getStorageEvents(): Observable<StorageEvent> {
  const isBrowser = typeof window !== 'undefined' && typeof window.addEventListener === 'function'

  if (!isBrowser) {
    return EMPTY
  }

  return fromEvent<StorageEvent>(window, 'storage')
}

export const subscribeToStorageEvents = createResourceAction(Auth, ({instance, context, state}) => {
  const {storageArea, storageKey} = context

  return () => {
    return getStorageEvents()
      .pipe(
        filter(
          (e): e is StorageEvent & {newValue: string} =>
            e.storageArea === storageArea && e.key === storageKey,
        ),
        map(() => getTokenFromStorage(instance)),
        distinctUntilChanged(),
      )
      .subscribe((token) =>
        state.set('tokenSetFromStorageEvent', {
          authState: token
            ? {type: 'logged-in', token, currentUser: null}
            : {type: 'logged-out', isDestroyingSession: false},
        }),
      )
  }
})
