import {ClientError} from '@sanity/client'
import {type CurrentUser} from '@sanity/types'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {type SanityInstance} from '../store/createSanityInstance'
import {type StateSource} from '../store/createStateSourceAction'
import {getCurrentUserState} from './authStore'
import {
  getProjectAccessErrorDetails,
  getProjectAccessErrorProjectId,
  getSignInMethodLabel,
  withProjectAccessMessage,
} from './projectAccessError'

vi.mock('./authStore', () => ({getCurrentUserState: vi.fn()}))

function makeClientError(statusCode: number, body: unknown, traceId?: string): ClientError {
  return new ClientError({
    statusCode,
    headers: traceId ? {traceparent: `00-${traceId}-00f067aa0ba902b7-01`} : {},
    body,
    url: 'https://abc123.api.sanity.io/v2025-01-01/data/query/production',
    method: 'GET',
  } as ConstructorParameters<typeof ClientError>[0])
}

const projectUserNotFoundBody = {
  error: {
    type: 'projectUserNotFoundError',
    description: 'project user not found for user ID "gUser123" in project "abc123"',
    projectID: 'abc123',
    userID: 'gUser123',
  },
}

describe('getProjectAccessErrorDetails', () => {
  it('reads the project ID, user ID, and trace ID from a projectUserNotFoundError', () => {
    const error = makeClientError(401, projectUserNotFoundBody, 'e711e3474d6727051e0912eb9ef7883c')

    expect(getProjectAccessErrorDetails(error)).toEqual({
      projectId: 'abc123',
      userId: 'gUser123',
      traceId: 'e711e3474d6727051e0912eb9ef7883c',
    })
  })

  it('unwraps a ClientError held as the cause of another error', () => {
    const wrapped = new Error('wrapped', {cause: makeClientError(401, projectUserNotFoundBody)})

    expect(getProjectAccessErrorDetails(wrapped)).toMatchObject({projectId: 'abc123'})
  })

  it('returns empty identifiers when the body only carries a description', () => {
    const error = makeClientError(401, {
      error: {type: 'projectUserNotFoundError', description: 'User is not a member.'},
    })

    expect(getProjectAccessErrorDetails(error)).toEqual({
      projectId: undefined,
      userId: undefined,
      traceId: undefined,
    })
  })

  it('returns null for other 401 errors', () => {
    const error = makeClientError(401, {error: {type: 'unauthorizedError'}})

    expect(getProjectAccessErrorDetails(error)).toBeNull()
  })

  it('returns null when the status code is not 401', () => {
    expect(getProjectAccessErrorDetails(makeClientError(403, projectUserNotFoundBody))).toBeNull()
  })

  it('returns null for values that are not client errors', () => {
    expect(getProjectAccessErrorDetails(new Error('nope'))).toBeNull()
    expect(getProjectAccessErrorDetails(undefined)).toBeNull()
  })
})

describe('getProjectAccessErrorProjectId', () => {
  it('returns the rejected project ID from a projectUserNotFoundError', () => {
    expect(getProjectAccessErrorProjectId(makeClientError(401, projectUserNotFoundBody))).toBe(
      'abc123',
    )
  })

  it('returns null for other errors', () => {
    expect(
      getProjectAccessErrorProjectId(makeClientError(401, {error: {type: 'other'}})),
    ).toBeNull()
    expect(getProjectAccessErrorProjectId('projectUserNotFoundError')).toBeNull()
  })

  it('returns null when the response does not name the project', () => {
    const error = makeClientError(401, {
      error: {type: 'projectUserNotFoundError', description: 'User is not a member.'},
    })

    expect(getProjectAccessErrorProjectId(error)).toBeNull()
  })
})

describe('getSignInMethodLabel', () => {
  it('names known providers and labels SAML providers as SSO', () => {
    expect(getSignInMethodLabel('google')).toBe('Google')
    expect(getSignInMethodLabel('sanity')).toBe('email and password')
    expect(getSignInMethodLabel('saml-abc123')).toBe('SSO')
  })

  it('returns undefined for unknown or missing providers', () => {
    expect(getSignInMethodLabel('external')).toBeUndefined()
    expect(getSignInMethodLabel(undefined)).toBeUndefined()
  })
})

describe('withProjectAccessMessage', () => {
  const instance = {} as SanityInstance
  const traceId = 'e711e3474d6727051e0912eb9ef7883c'

  beforeEach(() => {
    vi.mocked(getCurrentUserState).mockClear()
  })

  function signInAs(user: Partial<CurrentUser> | null) {
    vi.mocked(getCurrentUserState).mockReturnValue({
      getCurrent: () => user,
    } as StateSource<CurrentUser | null>)
  }

  it('explains the error and names the sign-in method', () => {
    signInAs({id: 'gUser123', email: 'ada@example.com', provider: 'google'})

    const error = withProjectAccessMessage(
      instance,
      makeClientError(401, projectUserNotFoundBody, traceId),
    )

    expect((error as Error).message).toBe(
      "Your Sanity account (signed in with Google) isn't a member of project abc123. " +
        'Each sign-in method, such as Google or SSO, is a separate account. ' +
        `Sign out and sign in with the account that has access. (traceId: ${traceId})`,
    )
    expect((error as Error).message).not.toContain('ada@example.com')
  })

  it('leaves out the sign-in method before the current user is known', () => {
    signInAs(null)

    const error = withProjectAccessMessage(instance, makeClientError(401, projectUserNotFoundBody))

    expect((error as Error).message).toMatch(
      /^Your Sanity account isn't a member of project abc123\./,
    )
  })

  it('keeps the status code, response body, and trace ID of the original error', () => {
    signInAs(null)

    const error = withProjectAccessMessage(
      instance,
      makeClientError(401, projectUserNotFoundBody, traceId),
    )

    expect(error).toBeInstanceOf(ClientError)
    expect((error as ClientError).statusCode).toBe(401)
    expect(getProjectAccessErrorDetails(error)).toEqual({
      projectId: 'abc123',
      userId: 'gUser123',
      traceId,
    })
  })

  it('returns an already rewritten error as is', () => {
    signInAs(null)
    const once = withProjectAccessMessage(instance, makeClientError(401, projectUserNotFoundBody))

    expect(withProjectAccessMessage(instance, once)).toBe(once)
  })

  it('returns other errors unchanged', () => {
    const otherClientError = makeClientError(401, {error: {type: 'unauthorizedError'}})
    const plainError = new Error('nope')

    expect(withProjectAccessMessage(instance, otherClientError)).toBe(otherClientError)
    expect(withProjectAccessMessage(instance, plainError)).toBe(plainError)
    expect(getCurrentUserState).not.toHaveBeenCalled()
  })
})
