import {installMessageBus, resetMessageBus} from '@sanity/sdk/_internal'
import {
  type ApplicationContext,
  type MessageBusHost,
  type MessageBusMeta,
  type PayloadOf,
} from '@sanity/sdk/dashboard'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {renderHook} from '../../../test/test-utils'
import {useApplicationContext} from './useApplicationContext'

type ContextUpdate = {
  payload: PayloadOf<'applications.context.update'>
  meta: MessageBusMeta
}

const MESSAGE_BUS_KEY = Symbol.for('sanity.os.bus')

let host: MessageBusHost

const context: ApplicationContext = {
  resource: {id: 'proj.ds', type: 'dataset'},
  document: {id: 'doc'},
}

describe('useApplicationContext', () => {
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

  const collect = (): ContextUpdate[] => {
    const messages: ContextUpdate[] = []
    host.subscribe('applications.context.update', (message) =>
      messages.push({payload: message.payload, meta: message.meta}),
    )
    return messages
  }

  it('emits the context on mount', () => {
    const messages = collect()

    renderHook(() => useApplicationContext(context))

    expect(messages.map((message) => message.payload)).toEqual([context])
  })

  it('does not re-emit when re-rendered with the same context', () => {
    const messages = collect()

    const {rerender} = renderHook(({value}) => useApplicationContext(value), {
      initialProps: {value: context},
    })
    rerender({value: context})

    expect(messages).toHaveLength(1)
  })

  it('clears the old context before publishing a new one', () => {
    const messages = collect()

    const {rerender} = renderHook(({value}) => useApplicationContext(value), {
      initialProps: {value: context},
    })
    const next: ApplicationContext = {resource: {id: 'proj.ds', type: 'dataset'}, document: null}
    rerender({value: next})

    expect(messages.map((message) => message.payload)).toEqual([context, null, next])
  })

  it('emits null on unmount', () => {
    const messages = collect()

    const {unmount} = renderHook(() => useApplicationContext(context))
    unmount()

    expect(messages.map((message) => message.payload)).toEqual([context, null])
  })

  it('stamps the sending application id on the message', () => {
    const messages = collect()

    renderHook(() => useApplicationContext(context))

    expect(messages[0].meta.appId).toBe('app')
  })
})
