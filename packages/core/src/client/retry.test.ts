import {
  ClientError,
  ConnectionFailedError,
  CorsOriginError,
  type SanityClient,
  ServerError,
} from '@sanity/client'
import {BehaviorSubject, defer, of, throwError} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {OUT_OF_SYNC_RETRY_COUNT, OUT_OF_SYNC_RETRY_MAX_DELAY} from '../document/documentConstants'
import {hasCredentials, retryRead} from './retry'

const createClient = (config: object = {token: 'token'}) => ({config: () => config}) as SanityClient
const clientError = (statusCode: number) => new ClientError({statusCode, headers: {}, body: {}})

function startRead(failures: unknown[]) {
  const clients = new BehaviorSubject(createClient())
  const setError = vi.fn()
  const values: string[] = []
  let attempts = 0

  defer(() => {
    const failure = failures[attempts++]

    return failure ? throwError(() => failure) : of('ok')
  })
    .pipe(retryRead(clients, setError))
    .subscribe((value) => values.push(value))

  return {clients, setError, values, attempts: () => attempts}
}

describe('retryRead', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it.each([
    ['a network error', new Error('Request error while attempting to reach')],
    ['a 5xx', new ServerError({statusCode: 503, headers: {}, body: {}})],
    ['a 408', clientError(408)],
    ['a 429', clientError(429)],
    ['a dropped listener', new ConnectionFailedError('closed')],
  ])('retries %s after a backoff without reporting it', async (_, error) => {
    const read = startRead([error])
    expect(read.values).toEqual([])

    await vi.advanceTimersByTimeAsync(OUT_OF_SYNC_RETRY_MAX_DELAY)

    expect(read.values).toEqual(['ok'])
    expect(read.setError).not.toHaveBeenCalled()
  })

  it.each([
    ['a 401', clientError(401)],
    ['a 403', clientError(403)],
    ['a rejected listener', new ConnectionFailedError('rejected', {status: 401})],
    ['a CORS error', new CorsOriginError({projectId: 'p'})],
    ['an unreadable document', Object.assign(new Error('inaccessible'), {statusCode: 403})],
  ])('reports %s and retries it only once the client changes', async (_, error) => {
    const read = startRead([error])
    expect(read.setError).toHaveBeenCalledWith(error)

    await vi.advanceTimersByTimeAsync(OUT_OF_SYNC_RETRY_MAX_DELAY * 10)
    expect(read.attempts()).toBe(1)

    read.clients.next(createClient())

    expect(read.values).toEqual(['ok'])
    expect(read.setError).toHaveBeenLastCalledWith(undefined)
  })

  it('reports a transient failure that outlasts its retries, then clears it on recovery', async () => {
    const error = new ServerError({statusCode: 503, headers: {}, body: {}})
    const read = startRead(Array.from({length: OUT_OF_SYNC_RETRY_COUNT + 1}, () => error))

    await vi.advanceTimersByTimeAsync(OUT_OF_SYNC_RETRY_MAX_DELAY * (OUT_OF_SYNC_RETRY_COUNT + 1))

    expect(read.setError.mock.calls).toEqual([[error], [undefined]])
    expect(read.values).toEqual(['ok'])
  })

  it('retries a transient failure right away when the client changes', () => {
    const read = startRead([new ServerError({statusCode: 503, headers: {}, body: {}})])

    read.clients.next(createClient())

    expect(read.values).toEqual(['ok'])
  })
})

describe('hasCredentials', () => {
  it.each([
    [{token: 'token'}, true],
    [{withCredentials: true}, true],
    [{}, false],
  ])('a client configured with %o has credentials: %s', (config, expected) => {
    expect(hasCredentials(createClient(config))).toBe(expected)
  })
})
