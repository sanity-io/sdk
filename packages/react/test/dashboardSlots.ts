import {type Context, createContext} from 'react'

/**
 * Gets or creates the context in a `Symbol.for(name)` slot the way the CLI's generated render
 * wrapper does (its `sharedContext`), so tests reach it without the SDK's own accessor.
 */
export function contextLikeTheCliWrapper<T>(name: string): Context<T | undefined> {
  const globals = globalThis as Record<symbol, WeakMap<object, Context<unknown>> | undefined>
  const slot = (globals[Symbol.for(name)] ??= new WeakMap())
  if (!slot.has(createContext)) slot.set(createContext, createContext<unknown>(undefined))
  return slot.get(createContext) as Context<T | undefined>
}
