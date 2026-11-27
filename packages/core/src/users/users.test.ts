import {ClientError, type SanityClient} from '@sanity/client'
import {of, throwError} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, onTestFinished, vi} from 'vitest'

import {getClientState} from '../client/clientStore'
import {uninstallTestMessageBus} from '../dashboard/messageBus/__fixtures__/uninstallTestMessageBus'
import {installMessageBus} from '../dashboard/messageBus/bus'
import {createSanityInstance, type SanityInstance} from '../store/createSanityInstance'
import {type StateSource} from '../store/createStateSourceAction'
import {type SanityUser} from './types'
import {users} from './users'

vi.mock('../client/clientStore')

const sanityUser = (id: string): SanityUser => ({
  sanityUserId: id,
  profile: {
    id: `profile-${id}`,
    displayName: `User ${id}`,
    email: `${id}@example.com`,
    provider: 'google',
    createdAt: '2023-01-01T00:00:00Z',
  },
  memberships: [],
})

describe('users', () => {
  let instance: SanityInstance
  const request = vi.fn()

  beforeEach(() => {
    instance = createSanityInstance({projectId: 'test', dataset: 'test'})
    request.mockReset()
    vi.mocked(getClientState).mockReturnValue({
      observable: of({observable: {request}} as unknown as SanityClient),
    } as StateSource<SanityClient>)
  })

  afterEach(() => instance.dispose())

  it("reads the first page of a project's users, a batch at a time", async () => {
    request.mockReturnValue(of({data: [sanityUser('u1')], totalCount: 2, nextCursor: 'c1'}))

    const pages = await users.resolveState(instance, {projectId: 'project1', batchSize: 1})

    expect(pages).toEqual([{data: [sanityUser('u1')], totalCount: 2, nextCursor: 'c1'}])
    expect(request).toHaveBeenCalledExactlyOnceWith({
      method: 'GET',
      url: 'access/project/project1/users',
      tag: 'users.list',
      query: {limit: '1'},
    })
  })

  it('reads the next page with the cursor the one before returned', async () => {
    request
      .mockReturnValueOnce(of({data: [sanityUser('u1')], totalCount: 2, nextCursor: 'c1'}))
      .mockReturnValueOnce(of({data: [sanityUser('u2')], totalCount: 2, nextCursor: null}))
    await users.resolveState(instance, {projectId: 'project1', batchSize: 1})

    const pages = await users.loadMore(instance, {projectId: 'project1', batchSize: 1})

    expect(pages.flatMap(({data}) => data)).toEqual([sanityUser('u1'), sanityUser('u2')])
    expect(request).toHaveBeenLastCalledWith({
      method: 'GET',
      url: 'access/project/project1/users',
      tag: 'users.list',
      query: {nextCursor: 'c1', limit: '1'},
    })
  })

  it("reads the users of the instance's project when none is given", async () => {
    request.mockReturnValue(of({data: [], totalCount: 0, nextCursor: null}))

    await users.resolveState(instance)

    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({url: 'access/project/test/users', query: {limit: '100'}}),
    )
  })

  it("reads an organization's users when only its ID is given, not the instance's project", async () => {
    request.mockReturnValue(of({data: [], totalCount: 0, nextCursor: null}))

    await users.resolveState(instance, {organizationId: 'org1'})

    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({url: 'access/organization/org1/users'}),
    )
  })

  it('reads an organization list against the organization the app names', async () => {
    instance.dispose()
    instance = createSanityInstance({organizationId: 'org-configured'})
    request.mockReturnValue(of({data: [], totalCount: 0, nextCursor: null}))

    await users.resolveState(instance, {resourceType: 'organization'})

    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({url: 'access/organization/org-configured/users'}),
    )
  })

  it('scopes organization users to the current organization on the message bus', async () => {
    vi.stubGlobal('__SANITY_APP_ID__', 'app')
    const host = installMessageBus({appId: 'dashboard'})
    onTestFinished(() => {
      uninstallTestMessageBus()
      vi.unstubAllGlobals()
    })
    request.mockReturnValue(of({data: [], totalCount: 0, nextCursor: null}))
    host.connections.subscribe((client) =>
      client.emit('organizations.current', {id: 'oSyH1iET5', name: 'Fernway', slug: 'fernway'}),
    )

    await users.resolveState(instance, {resourceType: 'organization'})

    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({url: 'access/organization/oSyH1iET5/users'}),
    )
  })

  it('reports a missing project ID right away', () => {
    instance.dispose()
    instance = createSanityInstance({})

    expect(() => users.getState(instance, {resourceType: 'project'}).getCurrent()).toThrow(
      'Project ID required for this API.',
    )
    expect(request).not.toHaveBeenCalled()
  })
})

describe('users with a userId', () => {
  let instance: SanityInstance
  const request = vi.fn()

  beforeEach(() => {
    instance = createSanityInstance({projectId: 'test', dataset: 'test'})
    request.mockReset()
    vi.mocked(getClientState).mockReturnValue({
      observable: of({observable: {request}} as unknown as SanityClient),
    } as StateSource<SanityClient>)
  })

  afterEach(() => instance.dispose())

  it("reads a project user from the project's API, as the only user in the list", async () => {
    request.mockReturnValue(
      of({
        id: 'p12345',
        sanityUserId: 'p12345',
        displayName: 'Project User',
        createdAt: '2023-01-01T00:00:00Z',
        updatedAt: '2023-01-01T00:00:00Z',
        isCurrentUser: false,
        projectId: 'project1',
        familyName: null,
        givenName: null,
        middleName: null,
        imageUrl: null,
        email: 'project@example.com',
        provider: 'google',
      }),
    )

    const pages = await users.resolveState(instance, {userId: 'p12345', projectId: 'project1'})

    expect(getClientState).toHaveBeenCalledWith(
      instance,
      expect.objectContaining({projectId: 'project1'}),
    )
    expect(request).toHaveBeenCalledWith({method: 'GET', url: '/users/p12345', tag: 'users.get'})
    expect(pages).toEqual([
      {
        data: [
          {
            sanityUserId: 'p12345',
            profile: {
              id: 'p12345',
              displayName: 'Project User',
              familyName: undefined,
              givenName: undefined,
              middleName: undefined,
              imageUrl: undefined,
              createdAt: '2023-01-01T00:00:00Z',
              updatedAt: '2023-01-01T00:00:00Z',
              isCurrentUser: false,
              email: 'project@example.com',
              provider: 'google',
            },
            memberships: [],
          },
        ],
        totalCount: 1,
        nextCursor: null,
      },
    ])
  })

  it('reads a global user from the access API of the resource it belongs to', async () => {
    request.mockReturnValue(of(sanityUser('g12345')))

    const pages = await users.resolveState(instance, {userId: 'g12345', projectId: 'project1'})

    expect(pages).toEqual([{data: [sanityUser('g12345')], totalCount: 1, nextCursor: null}])
    expect(getClientState).toHaveBeenCalledWith(
      instance,
      expect.objectContaining({scope: 'global'}),
    )
    expect(request).toHaveBeenCalledWith({
      method: 'GET',
      url: 'access/project/project1/users/g12345',
      tag: 'users.get',
    })
  })

  it("reads an organization's user from the organization's access API", async () => {
    request.mockReturnValue(of(sanityUser('g1')))

    await users.resolveState(instance, {
      userId: 'g1',
      resourceType: 'organization',
      organizationId: 'org1',
    })

    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({url: 'access/organization/org1/users/g1'}),
    )
  })

  it('reports a missing resource ID for a user right away', () => {
    instance.dispose()
    instance = createSanityInstance({})

    expect(() => users.getState(instance, {userId: 'gUser1'}).getCurrent()).toThrow(
      'An organizationId or a projectId is required',
    )
    expect(request).not.toHaveBeenCalled()
  })
})

describe('users with userIds', () => {
  let instance: SanityInstance
  const request = vi.fn()

  const legacyUser = (
    id: string,
    overrides: Partial<{
      sanityUserId: string
      displayName: string
      email: string | null
      provider: string | null
      imageUrl: string | null
    }> = {},
  ) => ({
    id,
    displayName: `User ${id}`,
    email: `${id}@example.com`,
    familyName: null,
    givenName: null,
    middleName: null,
    imageUrl: null,
    provider: 'google',
    createdAt: '2023-01-01T00:00:00Z',
    updatedAt: '2023-01-01T00:00:00Z',
    isCurrentUser: false,
    ...overrides,
  })

  const clientError = (statusCode: number, message: string) =>
    new ClientError({statusCode, headers: {}, body: {statusCode, error: 'Error', message}})

  beforeEach(() => {
    instance = createSanityInstance({projectId: 'test', dataset: 'test'})
    request.mockReset()
    vi.mocked(getClientState).mockClear()
    vi.mocked(getClientState).mockReturnValue({
      observable: of({observable: {request}} as unknown as SanityClient),
    } as StateSource<SanityClient>)
  })

  afterEach(() => instance.dispose())

  it('fetches multiple mixed project, global, and external IDs in a single project-scoped request', async () => {
    request.mockReturnValue(
      of([
        legacyUser('e-ext1', {provider: null}),
        legacyUser('gGlobal1'),
        legacyUser('pProj1', {sanityUserId: 'gLinked1'}),
      ]),
    )

    const pages = await users.resolveState(instance, {
      userIds: ['pProj1', 'gGlobal1', 'e-ext1'],
      projectId: 'project1',
    })

    expect(getClientState).toHaveBeenCalledWith(
      instance,
      expect.objectContaining({projectId: 'project1', apiVersion: '2025-07-18'}),
    )
    expect(request).toHaveBeenCalledExactlyOnceWith({
      method: 'GET',
      url: '/users/e-ext1,gGlobal1,pProj1',
      tag: 'users.get',
    })
    expect(pages).toEqual([
      {
        data: [
          expect.objectContaining({
            sanityUserId: 'e-ext1',
            profile: expect.objectContaining({id: 'e-ext1', provider: ''}),
            memberships: [],
          }),
          expect.objectContaining({
            sanityUserId: 'gGlobal1',
            profile: expect.objectContaining({id: 'gGlobal1'}),
            memberships: [],
          }),
          expect.objectContaining({
            sanityUserId: 'gLinked1',
            profile: expect.objectContaining({id: 'pProj1'}),
            memberships: [],
          }),
        ],
        totalCount: 3,
        nextCursor: null,
      },
    ])
  })

  it('handles a single user ID when the legacy API returns an object instead of an array', async () => {
    request.mockReturnValue(of(legacyUser('pOnly1', {sanityUserId: 'gOnly1', email: null})))

    const pages = await users.resolveState(instance, {userIds: ['pOnly1']})

    expect(request).toHaveBeenCalledExactlyOnceWith({
      method: 'GET',
      url: '/users/pOnly1',
      tag: 'users.get',
    })
    expect(pages[0]?.data).toEqual([
      expect.objectContaining({
        sanityUserId: 'gOnly1',
        profile: expect.objectContaining({id: 'pOnly1', email: ''}),
      }),
    ])
    expect(pages[0]?.totalCount).toBe(1)
    expect(pages[0]?.nextCursor).toBeNull()
  })

  it('uses the global client for organization-scoped or project-less instances and omits e* IDs', async () => {
    instance.dispose()
    instance = createSanityInstance({})
    request.mockReturnValue(of([legacyUser('g1'), legacyUser('p1', {sanityUserId: 'g2'})]))

    await users.resolveState(instance, {userIds: ['p1', 'g1', 'e-external']})

    expect(getClientState).toHaveBeenCalledWith(
      instance,
      expect.objectContaining({scope: 'global', apiVersion: '2025-07-18'}),
    )
    expect(request).toHaveBeenCalledExactlyOnceWith({
      method: 'GET',
      url: '/users/g1,p1',
      tag: 'users.get',
    })
  })

  it('deduplicates, filters invalid IDs, and shares the cache regardless of order', async () => {
    request.mockReturnValue(of([legacyUser('g1'), legacyUser('p1', {sanityUserId: 'g2'})]))

    await users.resolveState(instance, {userIds: ['p1', '<system>', 'g1', 'p1', 'invalid!']})
    await users.resolveState(instance, {userIds: ['g1', 'p1']})

    expect(request).toHaveBeenCalledExactlyOnceWith({
      method: 'GET',
      url: '/users/g1,p1',
      tag: 'users.get',
    })
  })

  it('returns an empty result without making a request when no valid user IDs are provided', async () => {
    const emptyPages = await users.resolveState(instance, {userIds: []})
    const invalidPages = await users.resolveState(instance, {userIds: ['<system>', 'not-valid']})

    expect(emptyPages).toEqual([{data: [], totalCount: 0, nextCursor: null}])
    expect(invalidPages).toEqual([{data: [], totalCount: 0, nextCursor: null}])
    expect(request).not.toHaveBeenCalled()
  })

  it('chunks large user ID lists into batches of 100', async () => {
    const ids = Array.from({length: 105}, (_, i) => `pUser${String(i).padStart(3, '0')}`)
    request
      .mockReturnValueOnce(of(ids.slice(0, 100).map((id) => legacyUser(id))))
      .mockReturnValueOnce(of(ids.slice(100).map((id) => legacyUser(id))))

    const pages = await users.resolveState(instance, {userIds: ids})

    expect(request).toHaveBeenCalledTimes(2)
    expect(request).toHaveBeenNthCalledWith(1, {
      method: 'GET',
      url: `/users/${ids.slice(0, 100).join(',')}`,
      tag: 'users.get',
    })
    expect(request).toHaveBeenNthCalledWith(2, {
      method: 'GET',
      url: `/users/${ids.slice(100).join(',')}`,
      tag: 'users.get',
    })
    expect(pages[0]?.data).toHaveLength(105)
    expect(pages[0]?.totalCount).toBe(105)
  })

  it('strips disallowed or robot IDs on 403 and resolves the remaining users', async () => {
    request
      .mockReturnValueOnce(
        throwError(() => clientError(403, 'Not allowed to fetch user with ID g-mlRobot1')),
      )
      .mockReturnValueOnce(
        throwError(() => clientError(403, 'Not allowed to fetch user with ID gUnknown')),
      )
      .mockReturnValueOnce(of([legacyUser('gAlice'), legacyUser('pBob', {sanityUserId: 'gBob'})]))

    const pages = await users.resolveState(instance, {
      userIds: ['gAlice', 'pBob', 'g-mlRobot1', 'gUnknown'],
    })

    expect(request).toHaveBeenCalledTimes(3)
    expect(request).toHaveBeenLastCalledWith({
      method: 'GET',
      url: '/users/gAlice,pBob',
      tag: 'users.get',
    })
    expect(pages[0]?.data.map((u) => u.profile.id)).toEqual(['gAlice', 'pBob'])
    expect(pages[0]?.totalCount).toBe(2)
  })

  it('returns an empty result without throwing on 404 or a generic 403', async () => {
    request.mockReturnValueOnce(throwError(() => clientError(404, 'User not found')))
    const notFound = await users.resolveState(instance, {userIds: ['pMissing']})

    request.mockReturnValueOnce(throwError(() => clientError(403, 'Forbidden')))
    const forbidden = await users.resolveState(instance, {userIds: ['pNoAccess1', 'pNoAccess2']})

    expect(notFound).toEqual([{data: [], totalCount: 0, nextCursor: null}])
    expect(forbidden).toEqual([{data: [], totalCount: 0, nextCursor: null}])
  })

  it('bisects chunks after linear 403 retries so many disallowed IDs never drop valid users', async () => {
    const denied = Array.from({length: 15}, (_, i) => `g-robot${String(i).padStart(2, '0')}`)
    const valid = Array.from({length: 10}, (_, i) => `gUser${String(i).padStart(2, '0')}`)
    const deniedSet = new Set(denied)

    request.mockImplementation(({url}: {url: string}) => {
      const requested = url.replace('/users/', '').split(',')
      const blocked = requested.find((id) => deniedSet.has(id))
      if (blocked) {
        return throwError(() => clientError(403, `Not allowed to fetch user with ID ${blocked}`))
      }
      return of(requested.map((id) => legacyUser(id)))
    })

    const pages = await users.resolveState(instance, {userIds: [...denied, ...valid]})

    expect(pages[0]?.data.map((u) => u.profile.id)).toEqual(valid)
    expect(pages[0]?.totalCount).toBe(valid.length)
    // After the 4th 403, remaining IDs split so the valid right half resolves in one call
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({url: `/users/${valid.join(',')}`}),
    )
  })

  it('returns an empty result without exceeding one request per ID when every ID is disallowed', async () => {
    const ids = Array.from({length: 15}, (_, i) => `gDenied${String(i).padStart(2, '0')}`)
    request.mockImplementation(({url}: {url: string}) => {
      const firstId = url.replace('/users/', '').split(',')[0]
      return throwError(() => clientError(403, `Not allowed to fetch user with ID ${firstId}`))
    })

    const pages = await users.resolveState(instance, {userIds: ids})

    // Each 403 strips one ID before retrying or splitting, so total requests never exceed ids.length
    expect(request).toHaveBeenCalledTimes(ids.length)
    expect(pages).toEqual([{data: [], totalCount: 0, nextCursor: null}])
  })

  it('propagates non-403/404 errors like 400 Bad Request and non-ClientError failures', async () => {
    const failure = clientError(400, 'Bad Request')
    request.mockReturnValueOnce(throwError(() => failure))

    await expect(users.resolveState(instance, {userIds: ['p1']})).rejects.toBe(failure)

    const networkError = new Error('network down')
    request.mockReturnValueOnce(throwError(() => networkError))

    await expect(users.resolveState(instance, {userIds: ['p2']})).rejects.toBe(networkError)
  })
})
