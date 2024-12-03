/* eslint-disable @typescript-eslint/no-explicit-any */
import {devtools} from 'zustand/middleware'
import {createStore as createZustandStore, type StoreApi} from 'zustand/vanilla'

import type {SanityInstance} from '../instance/types'

/**
 * Creates a (vanilla) zustand store with the given initial state and actions.
 * Only the actions will be returned - actions should be created to interact with it.
 *
 * The rationale for this is to encapsulate the internal state so only the store knows about it,
 * making refactoring easier and more predictable. While this seems like good practice, I am unsure
 * if it might get in our way once we start wanting to subscribe to finer piece of state or similar.
 * I will leave it for now, and we can see if it becomes a problem.
 *
 * @param initialState - Initial state of the store
 * @param actions - The actions available on the store
 * @param options - Options for the store
 * @returns The actions available on the store
 * @internal
 */
export function createStore<S, A extends StoreActionMap<S>>(
  initialState: S,
  actions: A,
  {name, instance}: StoreOptions,
): CurriedActions<S, A> {
  const uniqueName = `${name}-${instance.identity.id}`
  const store = createZustandStore<S>()(devtools(() => ({...initialState}), {name: uniqueName}))
  const context = {store, instance}
  return createCurriedActions(actions, context)
}

/**
 * Context passed to store actions as first argument.
 *
 * @internal
 */
export interface StoreActionContext<S> {
  /**
   * The store API, from zustand. Contains `getState()`, `setState()`, and `subscribe()`.
   */
  store: StoreApi<S>

  /**
   * The Sanity SDK instance associated with the store. Often used
   */
  instance: SanityInstance
}

/**
 * An action that can be performed on a store.
 *
 * @param context - Store context. Contains the store API (`getState()`, `setState()`, `subscribe()`), as well as the SDK instance associated with it.
 * @internal
 */
export type StoreAction<S> = (context: StoreActionContext<S>, ...args: any[]) => any

/**
 * A map of actions that can be performed on a store.
 *
 * @internal
 */
export type StoreActionMap<S> = Record<string, StoreAction<S>>

/**
 * Options for creating a store.
 *
 * @internal
 */
export interface StoreOptions {
  /**
   * Name used for debugging
   */
  name: string

  /**
   * The Sanity SDK instance associated with the store
   */
  instance: SanityInstance
}

function createCurriedActions<S, A extends StoreActionMap<S>>(
  actions: A,
  store: StoreActionContext<S>,
): CurriedActions<S, A> {
  const curried: CurriedActions<S, A> = {} as CurriedActions<S, A>
  return Object.entries(actions).reduce((acc, [key, action]) => {
    const curriedAction = (...args: RestParameters<typeof action>) => action(store, ...args)
    return {...acc, [key]: curriedAction}
  }, curried)
}

type RestParameters<T extends (...args: any[]) => any> = T extends (
  first: any,
  ...rest: infer R
) => any
  ? R
  : never

type ActionReturn<T extends (...args: any[]) => any> = ReturnType<T>

type CurriedActions<S, A extends StoreActionMap<S>> = {
  [K in keyof A]: A[K] extends StoreAction<S>
    ? (...args: RestParameters<A[K]>) => ActionReturn<A[K]>
    : never
}
