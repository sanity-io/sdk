import * as React from 'react'

const MODULE_SLOT_KEY = Symbol.for('sanity.os.module')
const ROOT_SLOT_KEY = Symbol.for('sanity.os.root')

/** The root a CLI-generated wrapper rendered the app into. */
interface DashboardRoot {
  /** Aborts when the host disposes the root, never when it hides it. */
  signal: AbortSignal
}

type ContextSlot<T> = WeakMap<typeof React.createContext, React.Context<T | undefined>>

function getSlotContext<T>(slotKey: symbol): React.Context<T | undefined> {
  const globals = globalThis as Record<symbol, ContextSlot<T> | undefined>
  const slot = (globals[slotKey] ??= new WeakMap())
  const key = React.createContext
  let context = slot.get(key)
  if (!context) {
    context = React.createContext<T | undefined>(undefined)
    slot.set(key, context)
  }
  return context
}

/**
 * Returns the React context that carries the current federation module id.
 *
 * @remarks
 * This is the slot the CLI-generated wrapper populates with
 * `renderOptions.moduleId`. The context lives in a per-React-copy slot on
 * `globalThis` so the CLI wrapper and the SDK share the same context even
 * across module copies. Each React copy gets its own context, since a context
 * created by one copy is inert in another.
 *
 * The slot is keyed on `React.createContext` rather than the `React` namespace
 * object: `import * as React` and `import React from 'react'` can yield
 * different wrapper objects for the same React copy under bundler interop,
 * whereas the `createContext` function is the same reference under both.
 *
 * The provider side lives in the CLI, which must not import the SDK:
 * `packages/@sanity/workbench-cli/src/actions/build/render-remote.ts` in
 * `sanity-io/cli` reconstructs this accessor (same symbol, same key) and
 * wraps `App` in the context's `Provider`. Nothing in this repo exports it.
 * @internal
 */
export function getDashboardModuleContext(): React.Context<string | undefined> {
  return getSlotContext<string>(MODULE_SLOT_KEY)
}

/**
 * Returns the React context that carries the {@link DashboardRoot} the app renders in.
 *
 * @remarks
 * Shared with the CLI-generated wrapper the same way as
 * {@link getDashboardModuleContext}, under `Symbol.for('sanity.os.root')`. It is a
 * separate context because older SDKs read the module context as a plain string.
 * @internal
 */
export function getDashboardRootContext(): React.Context<DashboardRoot | undefined> {
  return getSlotContext<DashboardRoot>(ROOT_SLOT_KEY)
}
