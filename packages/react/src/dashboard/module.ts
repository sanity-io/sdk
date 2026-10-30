import * as React from 'react'

const ROOT_SLOT_KEY = Symbol.for('sanity.os.root')

/** The root a CLI-generated wrapper rendered the app into. */
interface DashboardRoot {
  /** Aborts when the host disposes the root, never when it hides it. */
  signal: AbortSignal
  /** The federation module id the host rendered, from `renderOptions.moduleId`. */
  moduleId?: string
  /** The key of the host's bus connection, when the host passed `renderOptions.parentKey`. */
  parentKey?: string
}

type RootSlot = WeakMap<typeof React.createContext, React.Context<DashboardRoot | undefined>>

/**
 * Returns the React context that carries the {@link DashboardRoot} the app renders in.
 *
 * @remarks
 * The context lives in a per-React-copy slot on `globalThis` so the CLI wrapper and the SDK
 * share it even across module copies. Each React copy gets its own context, since a context
 * created by one copy is inert in another.
 *
 * The slot is keyed on `React.createContext` rather than the `React` namespace object:
 * `import * as React` and `import React from 'react'` can yield different wrapper objects for
 * the same React copy under bundler interop, whereas the `createContext` function is the same
 * reference under both.
 *
 * The provider side lives in the CLI, which must not import the SDK:
 * `packages/@sanity/workbench-cli/src/actions/build/render-remote.ts` in `sanity-io/cli`
 * reconstructs this accessor (same symbol, same key) and wraps `App` in the context's
 * `Provider`.
 * @internal
 */
export function getDashboardRootContext(): React.Context<DashboardRoot | undefined> {
  const globals = globalThis as {[ROOT_SLOT_KEY]?: RootSlot}
  const slot = (globals[ROOT_SLOT_KEY] ??= new WeakMap())
  const key = React.createContext
  let context = slot.get(key)
  if (!context) {
    context = React.createContext<DashboardRoot | undefined>(undefined)
    slot.set(key, context)
  }
  return context
}
