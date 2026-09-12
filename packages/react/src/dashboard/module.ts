import * as React from 'react'

const MODULE_SLOT_KEY = Symbol.for('sanity.os.module')

type ModuleContext = React.Context<string | undefined>
type ModuleSlot = WeakMap<typeof React.createContext, ModuleContext>

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
 * @internal
 */
export function getDashboardModuleContext(): ModuleContext {
  const globals = globalThis as {[MODULE_SLOT_KEY]?: ModuleSlot}
  const slot = (globals[MODULE_SLOT_KEY] ??= new WeakMap())
  const key = React.createContext
  let context = slot.get(key)
  if (!context) {
    context = React.createContext<string | undefined>(undefined)
    slot.set(key, context)
  }
  return context
}
