import {ClientError, ConnectionFailedError, CorsOriginError, ServerError} from '@sanity/client'
import {BehaviorSubject, concat, defer, Observable, of, throwError} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {OUT_OF_SYNC_RETRY_COUNT, OUT_OF_SYNC_RETRY_MAX_DELAY} from '../document/documentConstants'
import {DocumentInaccessibleError} from '../document/documentInaccessibleError'
import {retryOnCredentialChange, retryRead} from './retry'

const clientError = (statusCode: number, body: object = {}) =>
  new ClientError({statusCode, headers: {}, body})

const renew = (credentials: BehaviorSubject<unknown>) =>
  credentials.next(Promise.resolve({token: 'renewed'}))

function startRead(
  failures: unknown[],
  credentials = new BehaviorSubject<unknown>(Promise.resolve({token: 'initial'})),
) {
  const setError = vi.fn()
  const values: string[] = []
  let attempts = 0

  defer(() => {
    const failure = failures[attempts++]

    if (failure instanceof Observable) return failure

    return failure ? throwError(() => failure) : of('ok')
  })
    .pipe(retryRead({getCurrent: () => credentials.value, observable: credentials}, setError))
    .subscribe((value) => values.push(value))

  return {renewCredential: () => renew(credentials), setError, values, attempts: () => attempts}
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
  ])('reports %s and retries it only once the credential changes', async (_, error) => {
    const read = startRead([error])
    expect(read.setError).toHaveBeenCalledWith(error)

    await vi.advanceTimersByTimeAsync(OUT_OF_SYNC_RETRY_MAX_DELAY * 10)
    expect(read.attempts()).toBe(1)

    read.renewCredential()

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

    read.renewCredential()
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
    'retries %s only once the credential changes after its retry budget',
    async (_, error) => {
      const read = startRead(Array.from({length: OUT_OF_SYNC_RETRY_COUNT + 1}, () => error))

      await vi.advanceTimersByTimeAsync(OUT_OF_SYNC_RETRY_MAX_DELAY * (OUT_OF_SYNC_RETRY_COUNT + 2))
      expect(read.attempts()).toBe(OUT_OF_SYNC_RETRY_COUNT + 1)

      read.renewCredential()

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

  it.each([
    ['a 403', clientError(403)],
    ['a 401', clientError(401)],
  ])('reports %s after a reported server error', async (_, error) => {
    const serverError = new ServerError({statusCode: 503, headers: {}, body: {}})
    const read = startRead([
      ...Array.from({length: OUT_OF_SYNC_RETRY_COUNT + 1}, () => serverError),
      error,
    ])

    await vi.advanceTimersByTimeAsync(OUT_OF_SYNC_RETRY_MAX_DELAY * (OUT_OF_SYNC_RETRY_COUNT + 2))

    expect(read.setError.mock.calls).toEqual([[serverError], [error]])
    expect(read.attempts()).toBe(OUT_OF_SYNC_RETRY_COUNT + 2)
  })

  it('clears a session error once the renewed credential hits a server error, then reports it after its retries', async () => {
    const sessionError = clientError(401)
    const serverError = new ServerError({statusCode: 503, headers: {}, body: {}})
    const read = startRead([
      sessionError,
      ...Array.from({length: OUT_OF_SYNC_RETRY_COUNT + 1}, () => serverError),
    ])

    read.renewCredential()
    await vi.advanceTimersByTimeAsync(OUT_OF_SYNC_RETRY_MAX_DELAY * (OUT_OF_SYNC_RETRY_COUNT + 2))

    expect(read.setError.mock.calls).toEqual([
      [sessionError],
      [undefined],
      [serverError],
      [undefined],
    ])
    expect(read.values).toEqual(['ok'])
  })

  it('retries a 401 right away when the credential changed while the attempt was in flight', () => {
    const credentials = new BehaviorSubject<unknown>(Promise.resolve({token: 'initial'}))
    const read = startRead(
      [
        defer(() => {
          renew(credentials)
          return throwError(() => clientError(401))
        }),
      ],
      credentials,
    )

    expect(read.values).toEqual(['ok'])
  })

  it('retries a transient failure right away when the credential changes', () => {
    const read = startRead([new ServerError({statusCode: 503, headers: {}, body: {}})])

    read.renewCredential()

    expect(read.values).toEqual(['ok'])
  })
})

it('retryOnCredentialChange reports each failure, then retries once the credential changes', () => {
  const credentials = new BehaviorSubject<unknown>(Promise.resolve({token: 'initial'}))
  const error = new Error('connection failed')
  const onError = vi.fn()
  const values: string[] = []
  let attempts = 0

  defer(() => (attempts++ === 0 ? throwError(() => error) : of('ok')))
    .pipe(
      retryOnCredentialChange(
        {getCurrent: () => credentials.value, observable: credentials},
        onError,
      ),
    )
    .subscribe((value) => values.push(value))
  expect(onError).toHaveBeenCalledWith(error)
  expect(attempts).toBe(1)

  renew(credentials)

  expect(values).toEqual(['ok'])
})
