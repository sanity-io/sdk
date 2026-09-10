import {type Application} from '@sanity/sdk'
import {installMessageBus, resetMessageBus} from '@sanity/sdk/_internal'
import {type MessageBus} from '@sanity/sdk/dashboard'
import {afterEach, beforeEach, describe, expect, expectTypeOf, it, vi} from 'vitest'

import {act, renderHook} from '../../../test/test-utils'
import {useApplicationForegroundId} from './useApplicationForegroundId'

const MESSAGE_BUS_KEY = Symbol.for('sanity.os.bus')

let host: MessageBus

describe('useApplicationForegroundId', () => {
  beforeEach(() => {
    // The SDK resolves its own app ID from the CLI-embedded global.
    vi.stubGlobal('__SANITY_APP_ID__', 'app')
    host = installMessageBus({appId: 'dashboard'})
  })

  afterEach(() => {
    resetMessageBus()
    delete (globalThis as {[MESSAGE_BUS_KEY]?: unknown})[MESSAGE_BUS_KEY]
    vi.unstubAllGlobals()
  })

  it('reads the foreground application id and follows updates', () => {
    const {result} = renderHook(() => useApplicationForegroundId())

    expectTypeOf(result.current).toEqualTypeOf<Application['id'] | null>()
    expect(result.current).toBeNull()

    act(() => host.emit('applications.foreground', 'application-1'))

    expect(result.current).toBe('application-1')
  })
})
