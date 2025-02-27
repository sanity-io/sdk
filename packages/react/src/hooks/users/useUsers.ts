import {type ResourceType, type User} from '@sanity/access-api'
import {createUsersStore} from '@sanity/sdk'
import {useCallback, useEffect, useState, useSyncExternalStore} from 'react'

import {useSanityInstance} from '../context/useSanityInstance'

/**
 * @public
 */
interface UseUsersParams {
  /**
   * The type of resource to fetch users for.
   */
  resourceType: ResourceType
  /**
   * The ID of the resource to fetch users for.
   */
  resourceId: string
  /**
   * The limit of users to fetch.
   */
  limit?: number
}

/** @public */
export interface UseUsersResult {
  /**
   * The users fetched.
   */
  users: User[]
  /**
   * Whether there are more users to fetch.
   */
  hasMore: boolean
  /**
   * Load more users.
   */
  loadMore: () => void
}

/** @public */
export function useUsers(params: UseUsersParams): UseUsersResult {
  const instance = useSanityInstance()
  const [store] = useState(() => createUsersStore(instance))

  useEffect(() => {
    store.setOptions({
      resourceType: params.resourceType,
      resourceId: params.resourceId,
    })
  }, [params.resourceType, params.resourceId, store])

  const subscribe = useCallback(
    (onStoreChanged: () => void) => {
      if (store.getState().getCurrent().initialFetchCompleted === false) {
        store.resolveUsers()
      }
      const unsubscribe = store.getState().subscribe(onStoreChanged)

      return () => {
        unsubscribe()
        store.dispose()
      }
    },
    [store],
  )

  const getSnapshot = useCallback(() => store.getState().getCurrent(), [store])

  const {users, hasMore} = useSyncExternalStore(subscribe, getSnapshot) || {}

  return {users, hasMore, loadMore: store.loadMore}
}
