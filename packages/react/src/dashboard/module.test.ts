import {afterEach, expect, it} from 'vitest'

import {contextLikeTheCliWrapper} from '../../test/dashboardSlots'
import {getDashboardModuleContext, getDashboardRootContext} from './module'

afterEach(() => {
  const globals = globalThis as Record<symbol, unknown>
  delete globals[Symbol.for('sanity.os.module')]
  delete globals[Symbol.for('sanity.os.root')]
})

it('reads the module context the CLI wrapper created', () => {
  const context = contextLikeTheCliWrapper('sanity.os.module')
  expect(getDashboardModuleContext()).toBe(context)
})

it('reads the root context the CLI wrapper created', () => {
  const context = contextLikeTheCliWrapper('sanity.os.root')
  expect(getDashboardRootContext()).toBe(context)
})
