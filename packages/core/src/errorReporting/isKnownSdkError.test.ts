import {ClientError, ConnectionFailedError, ServerError} from '@sanity/client'
import {describe, expect, it} from 'vitest'

import {MessageBusError} from '../dashboard/messageBus/bus'
import {TopicError} from '../dashboard/messageBus/topicStore'
import {DocumentInaccessibleError} from '../document/documentInaccessibleError'
import {ActionError} from '../document/processActions/shared'
import {isKnownSdkError} from './isKnownSdkError'

const response = (statusCode: number) =>
  ({statusCode, headers: {}, body: {}, url: 'https://example.com'}) as never

describe('isKnownSdkError', () => {
  it.each([
    ['ActionError', new ActionError({message: 'm', documentId: 'd', transactionId: 't'})],
    ['DocumentInaccessibleError', new DocumentInaccessibleError('abc')],
    ['MessageBusError', new MessageBusError('timeout' as never)],
    ['TopicError', new TopicError('topic' as never)],
    ['ClientError', new ClientError(response(403))],
    ['ServerError', new ServerError(response(500))],
  ])('treats %s as known', (_name, error) => {
    expect(isKnownSdkError(error)).toBe(true)
  })

  it.each([
    ['ConnectionFailedError', new ConnectionFailedError('connection failed')],
    ['a timeout error', Object.assign(new Error('timed out'), {name: 'TimeoutError'})],
    ['an AbortError', Object.assign(new Error('aborted'), {name: 'AbortError'})],
    ['an abort DOMException', new DOMException('The operation was aborted.', 'AbortError')],
    ['a failed fetch in Chromium', new TypeError('Failed to fetch')],
    ['a failed fetch in Firefox', new TypeError('NetworkError when attempting to fetch resource.')],
    ['a failed fetch in Safari', new TypeError('Load failed')],
  ])('treats %s as known', (_name, error) => {
    expect(isKnownSdkError(error)).toBe(true)
  })

  it('does not treat other TypeErrors as network failures', () => {
    expect(isKnownSdkError(new TypeError('Cannot read properties of undefined'))).toBe(false)
  })

  it('treats an error wrapping a known error as known', () => {
    const wrapper = new Error('wrapper', {cause: new DocumentInaccessibleError('abc')})
    expect(isKnownSdkError(wrapper)).toBe(true)
  })

  it('treats unexpected errors as unknown', () => {
    expect(isKnownSdkError(new TypeError('x is not a function'))).toBe(false)
    expect(isKnownSdkError(new Error('boom'))).toBe(false)
    expect(isKnownSdkError('boom')).toBe(false)
  })

  it('stops on a cause chain that loops back on itself', () => {
    const error = new Error('loop')
    error.cause = error
    expect(isKnownSdkError(error)).toBe(false)
  })
})
