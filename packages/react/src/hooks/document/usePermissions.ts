import {type DocumentAction, getDocumentStore, type PermissionsResult} from '@sanity/sdk'
import {useCallback, useMemo, useSyncExternalStore} from 'react'
import {filter, firstValueFrom} from 'rxjs'

import {useSanityInstance} from '../context/useSanityInstance'

/** @beta */
export function usePermissions(actions: DocumentAction | DocumentAction[]): PermissionsResult {
  const actionArray = Array.isArray(actions) ? actions : [actions]
  const datasetResourceId = actionArray[0].datasetResourceId
  if (actionArray.some((action) => action.datasetResourceId !== datasetResourceId)) {
    throw new Error('All actions must have the same datasetResourceId')
  }
  const instance = useSanityInstance()
  const store = getDocumentStore(instance, datasetResourceId)
  const isDocumentReady = useCallback(
    () => store.getPermissionsState(actions).getCurrent() !== undefined,
    [actions, store],
  )
  if (!isDocumentReady()) {
    throw firstValueFrom(
      store.getPermissionsState(actions).observable.pipe(filter((result) => result !== undefined)),
    )
  }

  const {subscribe, getCurrent} = useMemo(
    () => store.getPermissionsState(actions),
    [actions, store],
  )

  return useSyncExternalStore(subscribe, getCurrent) as PermissionsResult
}
