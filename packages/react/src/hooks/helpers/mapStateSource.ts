import {type StateSource} from '@sanity/sdk'
import {distinctUntilChanged, map} from 'rxjs'

/**
 * Derives a `StateSource` by mapping another source's values. Bridges the
 * data-only shape the current hooks expose onto the fetcher snapshot envelope
 * until the hook layer migrates to consuming snapshots directly (SDK-1448).
 *
 * @internal
 */
export function mapStateSource<T, U>(source: StateSource<T>, fn: (value: T) => U): StateSource<U> {
  return {
    subscribe: source.subscribe,
    getCurrent: () => fn(source.getCurrent()),
    get observable() {
      return source.observable.pipe(map(fn), distinctUntilChanged())
    },
  }
}
