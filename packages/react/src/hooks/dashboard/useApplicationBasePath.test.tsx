import {installMessageBus, resetMessageBus} from '@sanity/sdk/_internal'
import {type MessageBusHost, TopicError} from '@sanity/sdk/dashboard'
import {Suspense} from 'react'
import {ErrorBoundary} from 'react-error-boundary'
import {afterEach, beforeEach, describe, expect, expectTypeOf, it, vi} from 'vitest'

import {act, render, screen} from '../../../test/test-utils'
import {useApplicationBasePath} from './useApplicationBasePath'

const MESSAGE_BUS_KEY = Symbol.for('sanity.os.bus')

let host: MessageBusHost

describe('useApplicationBasePath', () => {
  beforeEach(() => {
    vi.stubGlobal('__SANITY_APP_ID__', 'app')
    host = installMessageBus({appId: 'dashboard'})
  })

  afterEach(() => {
    resetMessageBus()
    delete (globalThis as {[MESSAGE_BUS_KEY]?: unknown})[MESSAGE_BUS_KEY]
    vi.unstubAllGlobals()
  })

  it('suspends until Dashboard publishes, then follows updates', async () => {
    function BasePath() {
      const basePath = useApplicationBasePath()
      expectTypeOf(basePath).toEqualTypeOf<string>()
      return <span>{basePath}</span>
    }

    render(
      <Suspense fallback="Loading">
        <BasePath />
      </Suspense>,
    )

    expect(screen.getByText('Loading')).toBeInTheDocument()

    await act(async () => {
      host.connections.subscribe((client) =>
        client.emit('applications.base-path', {ok: true, value: '/application/app'}),
      )
    })
    expect(await screen.findByText('/application/app')).toBeInTheDocument()

    act(() =>
      host.connections.subscribe((client) =>
        client.emit('applications.base-path', {ok: true, value: '/application/app-2'}),
      ),
    )
    expect(screen.getByText('/application/app-2')).toBeInTheDocument()
  })

  it('throws a TopicError when the application is unknown', () => {
    host.connections.subscribe((client) => client.emit('applications.base-path', {ok: false}))
    const onError = vi.fn()

    function BasePath() {
      return <span>{useApplicationBasePath()}</span>
    }

    render(
      <ErrorBoundary fallback={<span>Failed</span>} onError={onError}>
        <Suspense fallback="Loading">
          <BasePath />
        </Suspense>
      </ErrorBoundary>,
    )

    expect(screen.getByText('Failed')).toBeInTheDocument()
    const error = onError.mock.calls[0][0] as TopicError
    expect(error).toBeInstanceOf(TopicError)
    expect(error.topic).toBe('applications.base-path')
  })
})
