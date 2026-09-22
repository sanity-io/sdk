import {omitProperty} from '../utils/object'

interface QueryState {
  result?: unknown
  error?: unknown
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
  (key: string, result: unknown) =>
  (prev: QueryStoreState): QueryStoreState => {
    const prevQuery = prev.queries[key]
    if (!prevQuery) return prev
    return {
      ...prev,
      queries: {...prev.queries, [key]: {...prevQuery, result: result ?? null}},
    }
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
    if (!subscribers.length) return {...prev, queries: omitProperty(prev.queries, key)}
    return {...prev, queries: {...prev.queries, [key]: {...prevQuery, subscribers}}}
  }
