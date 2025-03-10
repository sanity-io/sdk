import {omit} from 'lodash-es'

interface QueryState {
  syncTags?: string[]
  result?: unknown
  error?: unknown
  lastLiveEventId?: string
  subscribers: string[]
}

export interface QueryStoreState {
  queries: {[key: string]: QueryState | undefined}
  error?: unknown
}

export const setQueryError =
  (key: string, error: unknown) =>
  (prev: QueryStoreState): QueryStoreState => {
    const prevQuery = prev.queries[key]
    if (!prevQuery) return prev
    return {...prev, queries: {...prev.queries, [key]: {...prevQuery, error}}}
  }

export const setQueryData =
  (key: string, result: unknown, syncTags?: string[]) =>
  (prev: QueryStoreState): QueryStoreState => {
    const prevQuery = prev.queries[key]
    if (!prevQuery) return prev
    return {
      ...prev,
      queries: {...prev.queries, [key]: {...prevQuery, result: result ?? null, syncTags}},
    }
  }

export const setLastLiveEventId =
  (key: string, lastLiveEventId: string) =>
  (prev: QueryStoreState): QueryStoreState => {
    const prevQuery = prev.queries[key]
    if (!prevQuery) return prev
    return {...prev, queries: {...prev.queries, [key]: {...prevQuery, lastLiveEventId}}}
  }

export const addSubscriber =
  (key: string, subscriptionId: string) =>
  (prev: QueryStoreState): QueryStoreState => {
    const prevQuery = prev.queries[key]
    const subscribers = [...(prevQuery?.subscribers ?? []), subscriptionId]
    return {...prev, queries: {...prev.queries, [key]: {...prevQuery, subscribers}}}
  }

export const removeSubscriber =
  (key: string, subscriptionId: string) =>
  (prev: QueryStoreState): QueryStoreState => {
    const prevQuery = prev.queries[key]
    if (!prevQuery) return prev
    const subscribers = prevQuery.subscribers.filter((id) => id !== subscriptionId)
    if (!subscribers.length) return {...prev, queries: omit(prev.queries, key)}
    return {...prev, queries: {...prev.queries, [key]: {...prevQuery, subscribers}}}
  }

export const cancelQuery =
  (key: string) =>
  (prev: QueryStoreState): QueryStoreState => {
    const prevQuery = prev.queries[key]
    if (!prevQuery) return prev
    if (prevQuery.subscribers.length) return prev
    return {...prev, queries: omit(prev.queries, key)}
  }

export const initializeQuery =
  (key: string) =>
  (prev: QueryStoreState): QueryStoreState => {
    if (prev.queries[key]) return prev
    return {...prev, queries: {...prev.queries, [key]: {subscribers: []}}}
  }
