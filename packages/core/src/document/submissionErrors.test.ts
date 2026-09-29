import {ClientError, CorsOriginError, ServerError} from '@sanity/client'
import {describe, expect, it} from 'vitest'

import {classifySubmissionError} from './submissionErrors'

const clientError = (statusCode: number, body: unknown = {}) =>
  new ClientError({statusCode, headers: {}, body})

describe('classifySubmissionError', () => {
  it('retries an expired or missing session', () => {
    expect(
      classifySubmissionError(
        clientError(401, {statusCode: 401, error: 'Unauthorized', message: 'Session not found'}),
      ),
    ).toBe('retry')
  })

  it('retries server errors, timeouts, rate limits and network failures', () => {
    expect(classifySubmissionError(new ServerError({statusCode: 503, headers: {}, body: {}}))).toBe(
      'retry',
    )
    expect(classifySubmissionError(clientError(408))).toBe('retry')
    expect(classifySubmissionError(clientError(429))).toBe('retry')
    expect(classifySubmissionError(new Error('Request error while attempting to reach'))).toBe(
      'retry',
    )
    expect(classifySubmissionError('not an error')).toBe('retry')
  })

  it('retries a transaction that hit contention while committing', () => {
    expect(
      classifySubmissionError(
        clientError(409, {
          error: {type: 'transactionConflictError', description: 'transaction conflict'},
        }),
      ),
    ).toBe('retry')
  })

  it('treats an already recorded transaction ID as an ack', () => {
    expect(
      classifySubmissionError(
        clientError(409, {
          error: {type: 'transactionAlreadyExistsError', description: 'already exists'},
        }),
      ),
    ).toBe('accepted')
  })

  it('reverts transactions the server rejected', () => {
    for (const statusCode of [400, 402, 403, 404, 410, 412, 413, 422]) {
      expect(classifySubmissionError(clientError(statusCode))).toBe('revert')
    }
    expect(
      classifySubmissionError(
        clientError(409, {
          error: {type: 'documentRevisionIDDoesNotMatchError', description: 'revision mismatch'},
        }),
      ),
    ).toBe('revert')
    expect(classifySubmissionError(new CorsOriginError({projectId: 'p'}))).toBe('revert')
  })
})
