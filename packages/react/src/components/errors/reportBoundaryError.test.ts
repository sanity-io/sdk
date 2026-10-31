import {CorsOriginError} from '@sanity/client'
import {reportError} from '@sanity/sdk/_internal'
import {type ErrorInfo} from 'react'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {AuthError} from '../auth/AuthError'
import {ConfigurationError} from '../auth/ConfigurationError'
import {reportBoundaryError} from './reportBoundaryError'

vi.mock('@sanity/sdk/_internal', () => ({reportError: vi.fn()}))

const info = {componentStack: '\n    at Foo'} as ErrorInfo

describe('reportBoundaryError', () => {
  beforeEach(() => {
    vi.mocked(reportError).mockClear()
  })

  it('reports an unexpected error with the boundary name and component stack', () => {
    const error = new TypeError('boom')
    reportBoundaryError('AuthBoundary')(error, info)
    expect(reportError).toHaveBeenCalledWith(error, {
      errorBoundary: 'AuthBoundary',
      componentStack: '\n    at Foo',
    })
  })

  it.each([
    ['AuthError', new AuthError(new Error('login failed'))],
    ['ConfigurationError', new ConfigurationError({message: 'bad config'})],
    ['CorsOriginError', new CorsOriginError({projectId: 'abc'})],
    [
      'a CorsOriginError from another copy of @sanity/client',
      Object.assign(new Error('CorsOriginError'), {name: 'CorsOriginError'}),
    ],
    [
      'a chunk load error',
      Object.assign(new Error('Loading chunk 5 failed.'), {name: 'ChunkLoadError'}),
    ],
  ])('does not report %s', (_name, error) => {
    reportBoundaryError('AuthBoundary')(error, info)
    expect(reportError).not.toHaveBeenCalled()
  })
})
