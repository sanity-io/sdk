import {type DocumentAction, getPermissionsState, type PermissionsResult} from '@sanity/sdk'
import {useCallback, useMemo, useSyncExternalStore} from 'react'
import {filter, firstValueFrom} from 'rxjs'

import {useSanityInstance} from '../context/useSanityInstance'

/** @beta */
export function usePermissions(actions: DocumentAction | DocumentAction[]): PermissionsResult {
  const instance = useSanityInstance()
  const isDocumentReady = useCallback(
    () => getPermissionsState(instance, actions).getCurrent() !== undefined,
    [actions, instance],
  )
  if (!isDocumentReady()) {
    throw firstValueFrom(
      getPermissionsState(instance, actions).observable.pipe(
        filter((result) => result !== undefined),
      ),
    )
  }

  const {subscribe, getCurrent} = useMemo(
    () => getPermissionsState(instance, actions),
    [actions, instance],
  )

  return useSyncExternalStore(subscribe, getCurrent) as PermissionsResult
}
