import {afterEach, expect, it} from 'vitest'

import {contextLikeTheCliWrapper} from '../../test/dashboardSlots'
import {getDashboardRootContext} from './module'

afterEach(() => {
  delete (globalThis as Record<symbol, unknown>)[Symbol.for('sanity.os.root')]
})

it('reads the root context the CLI wrapper created', () => {
  const context = contextLikeTheCliWrapper('sanity.os.root')
  expect(getDashboardRootContext()).toBe(context)
})
