import {describe, expect, it} from 'vitest'

import {beforeSend} from './privacy'
import {type ErrorEvent} from './sentryTypes'

function makeEvent(overrides: Partial<ErrorEvent> = {}): ErrorEvent {
  return {
    type: undefined,
    event_id: 'abc123',
    timestamp: 1234,
    platform: 'javascript',
    level: 'error',
    release: '3.10.0',
    environment: 'production',
    sdk: {name: 'sentry.javascript.browser', version: '11.8.0'},
    exception: {values: [{type: 'TypeError', value: 'x is not a function'}]},
    tags: {handled: 'no', errorBoundary: 'AuthBoundary'},
    contexts: {react: {componentStack: '\n    at Foo'}},
    user: {id: 'u1', email: 'a@b.c', ip_address: '1.2.3.4'},
    request: {url: 'https://app.example.com/page?token=secret', headers: {cookie: 'x'}},
    ...overrides,
  }
}

describe('beforeSend', () => {
  it('keeps the error, its identifiers, the allowed tags, and the react context', () => {
    const event = beforeSend(makeEvent())
    expect(event).toMatchObject({
      event_id: 'abc123',
      timestamp: 1234,
      platform: 'javascript',
      level: 'error',
      release: '3.10.0',
      environment: 'production',
      sdk: {name: 'sentry.javascript.browser', version: '11.8.0'},
      exception: {values: [{type: 'TypeError', value: 'x is not a function'}]},
      tags: {handled: 'no', errorBoundary: 'AuthBoundary'},
      contexts: {react: {componentStack: '\n    at Foo'}},
    })
  })

  it('replaces the user with a zeroed IP and deletes the request', () => {
    const event = beforeSend(makeEvent())
    expect(event.user).toEqual({ip_address: '0.0.0.0'})
    expect(event.request).toBeUndefined()
  })

  it('drops state a host page Sentry adds through the shared scopes', () => {
    const event = beforeSend(
      makeEvent({
        tags: {handled: 'no', customer_tag: 'secret-tenant', hostproc: 'ran'},
        extra: {cart: 'items'},
        breadcrumbs: [{message: 'clicked buy for customer X'}],
        contexts: {react: {componentStack: '\n    at Foo'}, device: {model: 'x'}, app: {name: 'y'}},
        fingerprint: ['host-fingerprint'],
        transaction: '/checkout',
        server_name: 'host',
      }),
    )
    expect(event.tags).toEqual({handled: 'no'})
    expect(event.extra).toBeUndefined()
    expect(event.breadcrumbs).toBeUndefined()
    expect(event.contexts).toEqual({react: {componentStack: '\n    at Foo'}})
    expect(event.fingerprint).toBeUndefined()
    expect(event.transaction).toBeUndefined()
    expect(event.server_name).toBeUndefined()
  })

  it('omits the react context when there is none', () => {
    const event = beforeSend(makeEvent({contexts: {device: {model: 'x'}}}))
    expect(event.contexts).toBeUndefined()
  })
})
