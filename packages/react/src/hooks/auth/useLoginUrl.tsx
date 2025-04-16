import {getLoginUrlState} from '@sanity/sdk'
import {useMemo, useSyncExternalStore} from 'react'

import {useSanityInstance} from '../context/useSanityInstance'

/**
 * @internal
 */
export function useLoginUrl(): string {
  const instance = useSanityInstance()
  const {subscribe, getCurrent} = useMemo(() => getLoginUrlState(instance), [instance])

  return useSyncExternalStore(subscribe, getCurrent as () => string)
}
