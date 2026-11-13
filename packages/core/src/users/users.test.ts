import {type SanityClient} from '@sanity/client'
import {firstValueFrom, NEVER, of} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, onTestFinished, vi} from 'vitest'

import {getClientState} from '../client/clientStore'
import {uninstallTestMessageBus} from '../dashboard/messageBus/__fixtures__/uninstallTestMessageBus'
import {installMessageBus} from '../dashboard/messageBus/bus'
import {createSanityInstance, type SanityInstance} from '../store/createSanityInstance'
import {type StateSource} from '../store/createStateSourceAction'
import {type SanityUser} from './types'
import {getUserState, resolveUser, user, users} from './users'

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
    expect(request).toHaveBeenLastCalledWith(
      expect.objectContaining({query: {nextCursor: 'c1', limit: '1'}}),
    )
  })

  it("reads the users of the instance's project when none is given", async () => {
    request.mockReturnValue(of({data: [], totalCount: 0, nextCursor: null}))

    await users.resolveState(instance)

    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({url: 'access/project/test/users', query: {limit: '100'}}),
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

describe('user', () => {
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

  it("reads a project user from the project's API, in the shape of any other user", async () => {
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

    const found = await user.resolveState(instance, {userId: 'p12345', projectId: 'project1'})

    expect(getClientState).toHaveBeenCalledWith(
      instance,
      expect.objectContaining({projectId: 'project1'}),
    )
    expect(request).toHaveBeenCalledWith({method: 'GET', url: '/users/p12345', tag: 'users.get'})
    expect(found).toEqual({
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
    })
  })

  it('reads a global user from the access API of the resource it belongs to', async () => {
    request.mockReturnValue(of({data: [sanityUser('g12345')], totalCount: 1, nextCursor: null}))

    const found = await resolveUser(instance, {userId: 'g12345', projectId: 'project1'})

    expect(found).toEqual(sanityUser('g12345'))
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

  it('finds no user when the access API lists none by that ID', async () => {
    request.mockReturnValue(of({data: [], totalCount: 0, nextCursor: null}))

    expect(await resolveUser(instance, {userId: 'g1', projectId: 'p'})).toBeUndefined()
  })

  it('reports a missing resource ID for a user right away', () => {
    instance.dispose()
    instance = createSanityInstance({})

    expect(() => user.getState(instance, {userId: 'gUser1'}).getCurrent()).toThrow(
      'An organizationId or a projectId is required',
    )
    expect(request).not.toHaveBeenCalled()
  })

  it('emits a user once it has been read', async () => {
    request.mockReturnValue(of(sanityUser('g1')))

    const found = await firstValueFrom(getUserState(instance, {userId: 'g1', projectId: 'p'}))

    expect(found).toEqual(sanityUser('g1'))
  })

  it('stops waiting for a user when the signal aborts', async () => {
    request.mockReturnValue(NEVER)
    const controller = new AbortController()

    const resolving = resolveUser(instance, {
      userId: 'g1',
      projectId: 'p',
      signal: controller.signal,
    })
    controller.abort()

    await expect(resolving).rejects.toMatchObject({name: 'AbortError'})
  })
})
