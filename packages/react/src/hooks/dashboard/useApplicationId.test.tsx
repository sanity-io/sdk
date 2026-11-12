import {installMessageBus, resetMessageBus} from '@sanity/sdk/_internal'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {renderHook} from '../../../test/test-utils'
import {useApplicationId} from './useApplicationId'

const MESSAGE_BUS_KEY = Symbol.for('sanity.os.bus')

describe('useApplicationId', () => {
  afterEach(() => {
    resetMessageBus()
    delete (globalThis as {[MESSAGE_BUS_KEY]?: unknown})[MESSAGE_BUS_KEY]
    vi.unstubAllGlobals()
  })

  it('returns the application id of the message bus connection', () => {
    vi.stubGlobal('__SANITY_APP_ID__', 'app')
    installMessageBus({appId: 'dashboard'})
    const {result} = renderHook(() => useApplicationId())
    expect(result.current).toBe('app')
  })

  it('returns null outside a Dashboard', () => {
    vi.stubGlobal('__SANITY_APP_ID__', 'app')
    const {result} = renderHook(() => useApplicationId())
    expect(result.current).toBeNull()
  })
})
