import {installMessageBus, resetMessageBus} from '@sanity/sdk/_internal'
import {type MessageBusHost} from '@sanity/sdk/dashboard'
import {Suspense} from 'react'
import {afterEach, beforeEach, describe, expect, expectTypeOf, it, vi} from 'vitest'

import {act, render, screen} from '../../../test/test-utils'
import {useBasePath} from './useBasePath'

const MESSAGE_BUS_KEY = Symbol.for('sanity.os.bus')

let host: MessageBusHost

describe('useBasePath', () => {
  beforeEach(() => {
    vi.stubGlobal('__SANITY_APP_ID__', 'app')
    host = installMessageBus({appId: 'dashboard'})
  })

  afterEach(() => {
    resetMessageBus()
    delete (globalThis as {[MESSAGE_BUS_KEY]?: unknown})[MESSAGE_BUS_KEY]
    vi.unstubAllGlobals()
  })

  it('requests the connected application base path and suspends until it resolves', async () => {
    let reply: ((basePath: string | null) => void) | undefined
    let requests = 0
    host.subscribe('applications.basepath', (message) => {
      requests += 1
      expect(message.meta.appId).toBe('app')
      reply = message.reply
    })

    function BasePath() {
      const basePath = useBasePath()
      expectTypeOf(basePath).toEqualTypeOf<string | null>()
      return <span>{basePath ?? 'none'}</span>
    }

    await act(async () => {
      render(
        <Suspense fallback="Loading">
          <BasePath />
        </Suspense>,
      )
    })

    expect(screen.getByText('Loading')).toBeInTheDocument()
    expect(requests).toBe(1)

    await act(async () => reply?.('/application/app'))

    expect(await screen.findByText('/application/app')).toBeInTheDocument()
    expect(requests).toBe(1)
  })
})
