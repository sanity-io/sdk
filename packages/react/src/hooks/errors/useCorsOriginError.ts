import {CorsOriginError} from '@sanity/client'
import {clearQueryError, getCorsErrorProjectId, getQueryErrorState} from '@sanity/sdk'
import {useCallback, useMemo, useSyncExternalStore} from 'react'

import {useSanityInstanceAndSource} from '../context/useSanityInstance'

export function useCorsOriginError(): {
  error: Error | null
  projectId: string | null
  clear: () => void
} {
  const [instance, source] = useSanityInstanceAndSource({})
  const {getCurrent, subscribe} = useMemo(
    () => getQueryErrorState(instance, {source}),
    [instance, source],
  )
  const error = useSyncExternalStore(subscribe, getCurrent)
  const clear = useCallback(() => clearQueryError(instance, {source}), [instance, source])
  const value = useMemo(() => {
    if (!(error instanceof CorsOriginError)) return {error: null, projectId: null}

    return {error: error as unknown as Error, projectId: getCorsErrorProjectId(error)}
  }, [error])
  return useMemo(() => ({...value, clear}), [value, clear])
}
