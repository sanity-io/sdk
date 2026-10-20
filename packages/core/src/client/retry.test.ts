import {
  ClientError,
  ConnectionFailedError,
  CorsOriginError,
  type SanityClient,
  ServerError,
} from '@sanity/client'
import {BehaviorSubject, concat, defer, Observable, of, throwError} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {OUT_OF_SYNC_RETRY_COUNT, OUT_OF_SYNC_RETRY_MAX_DELAY} from '../document/documentConstants'
import {DocumentInaccessibleError} from '../document/listen'
import {retryRead} from './retry'

const createClient = () => ({}) as SanityClient
const clientError = (statusCode: number, body: object = {}) =>
  new ClientError({statusCode, headers: {}, body})

function startRead(failures: unknown[]) {
  const clients = new BehaviorSubject(createClient())
  const setError = vi.fn()
  const values: string[] = []
  let attempts = 0

  defer(() => {
    const failure = failures[attempts++]

    if (failure instanceof Observable) return failure

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
    ['an expired session', clientError(401, {errorCode: 'SIO-401-AEX'})],
    ['a rejected listener', new ConnectionFailedError('rejected', {status: 401})],
    ['an unreadable document', new DocumentInaccessibleError('doc')],
  ])('reports %s and retries it only once the client changes', async (_, error) => {
    const read = startRead([error])
    expect(read.setError).toHaveBeenCalledWith(error)

    await vi.advanceTimersByTimeAsync(OUT_OF_SYNC_RETRY_MAX_DELAY * 10)
    expect(read.attempts()).toBe(1)

    read.clients.next(createClient())

    expect(read.values).toEqual(['ok'])
    expect(read.setError).toHaveBeenLastCalledWith(undefined)
  })

  it.each([
    ['a 400', clientError(400)],
    ['a 403', clientError(403)],
    ['a CORS error', new CorsOriginError({projectId: 'p'})],
  ])('reports %s and never retries it', async (_, error) => {
    const read = startRead([error])
    expect(read.setError).toHaveBeenCalledWith(error)

    read.clients.next(createClient())
    await vi.advanceTimersByTimeAsync(OUT_OF_SYNC_RETRY_MAX_DELAY * 10)

    expect(read.attempts()).toBe(1)
    expect(read.values).toEqual([])
  })

  const missingAccess = [
    ['a missing membership', clientError(401, {error: {type: 'projectUserNotFoundError'}})],
    ['a missing grant', clientError(401, {code: 'missing_grant'})],
  ] as const

  it.each(missingAccess)('reports %s once and retries it after a backoff', async (_, error) => {
    const read = startRead([error, error])

    await vi.advanceTimersByTimeAsync(OUT_OF_SYNC_RETRY_MAX_DELAY * 2)

    expect(read.setError.mock.calls).toEqual([[error], [undefined]])
    expect(read.values).toEqual(['ok'])
  })

  it.each(missingAccess)(
    'retries %s only once the client changes after its retry budget',
    async (_, error) => {
      const read = startRead(Array.from({length: OUT_OF_SYNC_RETRY_COUNT + 1}, () => error))

      await vi.advanceTimersByTimeAsync(OUT_OF_SYNC_RETRY_MAX_DELAY * (OUT_OF_SYNC_RETRY_COUNT + 2))
      expect(read.attempts()).toBe(OUT_OF_SYNC_RETRY_COUNT + 1)

      read.clients.next(createClient())

      expect(read.values).toEqual(['ok'])
      expect(read.setError.mock.calls).toEqual([[error], [undefined]])
    },
  )

  it('does not report a transient failure that recovers within its retries', async () => {
    const error = new ServerError({statusCode: 503, headers: {}, body: {}})
    const read = startRead(Array.from({length: OUT_OF_SYNC_RETRY_COUNT}, () => error))

    await vi.advanceTimersByTimeAsync(OUT_OF_SYNC_RETRY_MAX_DELAY * OUT_OF_SYNC_RETRY_COUNT)

    expect(read.setError).not.toHaveBeenCalled()
    expect(read.values).toEqual(['ok'])
  })

  it('reports a transient failure that outlasts its retries once, then clears it on recovery', async () => {
    const error = new ServerError({statusCode: 503, headers: {}, body: {}})
    const read = startRead(Array.from({length: OUT_OF_SYNC_RETRY_COUNT + 2}, () => error))

    await vi.advanceTimersByTimeAsync(OUT_OF_SYNC_RETRY_MAX_DELAY * (OUT_OF_SYNC_RETRY_COUNT + 2))

    expect(read.setError.mock.calls).toEqual([[error], [undefined]])
    expect(read.values).toEqual(['ok'])
  })

  it('reports each failure streak once', async () => {
    const error = new ServerError({statusCode: 503, headers: {}, body: {}})
    const okThenFail = concat(
      of('ok'),
      throwError(() => error),
    )
    const streak = [okThenFail, ...Array.from({length: OUT_OF_SYNC_RETRY_COUNT}, () => error)]
    const read = startRead([...streak, ...streak])

    await vi.advanceTimersByTimeAsync(
      OUT_OF_SYNC_RETRY_MAX_DELAY * (OUT_OF_SYNC_RETRY_COUNT + 1) * 2,
    )

    expect(read.setError.mock.calls).toEqual([[error], [undefined], [error], [undefined]])
  })

  it('reports a terminal failure after a reported transient one', async () => {
    const serverError = new ServerError({statusCode: 503, headers: {}, body: {}})
    const forbidden = clientError(403)
    const read = startRead([
      ...Array.from({length: OUT_OF_SYNC_RETRY_COUNT + 1}, () => serverError),
      forbidden,
    ])

    await vi.advanceTimersByTimeAsync(OUT_OF_SYNC_RETRY_MAX_DELAY * (OUT_OF_SYNC_RETRY_COUNT + 2))

    expect(read.setError.mock.calls).toEqual([[serverError], [forbidden]])
    expect(read.attempts()).toBe(OUT_OF_SYNC_RETRY_COUNT + 2)
  })

  it('retries a transient failure right away when the client changes', () => {
    const read = startRead([new ServerError({statusCode: 503, headers: {}, body: {}})])

    read.clients.next(createClient())

    expect(read.values).toEqual(['ok'])
  })
})
