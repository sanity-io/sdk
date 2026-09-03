import {type SanityClient} from '@sanity/client'
import {type SanityDocument} from '@sanity/types'
import {delay, NEVER, of} from 'rxjs'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {getClient, getClientState} from '../client/clientStore'
import {getDocumentState, resolveDocument} from '../document/documentStore'
import {createSanityInstance, type SanityInstance} from '../store/createSanityInstance'
import {type StateSource} from '../store/createStateSourceAction'
import {type FetcherSnapshot} from '../store/fetcherStore'
import {type ProjectUserIds, projectUserIds} from './projectUserIds'
import {type SystemGroup, systemGroups} from './systemGroups'
import {type SanityUser, type SanityUserResponse} from './types'
import {
  getUsersWithGrantsKey,
  getUsersWithGrantsState,
  parseUsersWithGrantsKey,
  resolveUsersWithGrants,
} from './usersWithGrants'

vi.mock('../client/clientStore')
vi.mock('../document/documentStore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../document/documentStore')>()),
  resolveDocument: vi.fn(),
  getDocumentState: vi.fn(),
}))
vi.mock('./systemGroups', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./systemGroups')>()),
  systemGroups: {
    getState: vi.fn(),
    resolveState: vi.fn(),
  },
}))
vi.mock('./projectUserIds', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./projectUserIds')>()),
  projectUserIds: {
    getState: vi.fn(),
    resolveState: vi.fn(),
    refetch: vi.fn(),
  },
}))

/**
 * The access API returns the account-wide id as both `sanityUserId` and
 * `profile.id`; only the project membership carries the project user id that
 * access groups list as their members.
 */
const user = (id: string, displayName: string, projectUserId?: string): SanityUser => ({
  sanityUserId: `g-${id}`,
  profile: {
    id: `g-${id}`,
    displayName,
    email: `${id}@example.com`,
    provider: 'google',
    createdAt: '2023-01-01T00:00:00Z',
  },
  memberships: projectUserId
    ? [
        {
          resourceType: 'project',
          resourceId: 'p',
          roleNames: ['editor'],
          resourceUserId: projectUserId,
        },
      ]
    : [],
})

const ada = user('ada', 'Ada', 'p-ada')
const grace = user('grace', 'Grace', 'p-grace')

const article: SanityDocument = {
  _id: 'article-1',
  _type: 'article',
  _rev: 'rev',
  _createdAt: '2023-01-01T00:00:00Z',
  _updatedAt: '2023-01-01T00:00:00Z',
}

const document = {documentId: 'article-1', documentType: 'article'}

describe('usersWithGrants', () => {
  let instance: SanityInstance

  const mockUsers = (users: SanityUser[]) => {
    const response: SanityUserResponse = {
      data: users,
      totalCount: users.length,
      nextCursor: null,
    }
    const request = vi.fn().mockReturnValue(of(response).pipe(delay(0)))

    vi.mocked(getClientState).mockReturnValue({
      observable: of({observable: {request}} as unknown as SanityClient),
    } as StateSource<SanityClient>)
    vi.mocked(getClient).mockReturnValue({
      observable: {request},
    } as unknown as SanityClient)
  }

  beforeEach(() => {
    vi.clearAllMocks()
    instance = createSanityInstance({projectId: 'p', dataset: 'd'})
    mockUsers([ada, grace])
    vi.mocked(resolveDocument).mockResolvedValue(article)
  })

  it('grants everyone when no document is given', async () => {
    const result = await resolveUsersWithGrants(instance, {
      resourceType: 'project',
      projectId: 'p',
    })

    expect(result?.data).toEqual([
      {...ada, granted: true},
      {...grace, granted: true},
    ])
    expect(systemGroups.resolveState).not.toHaveBeenCalled()

    instance.dispose()
  })

  it('grants everyone in an organization read when no document is given', async () => {
    const result = await resolveUsersWithGrants(instance, {
      resourceType: 'organization',
      organizationId: 'org-1',
    })

    expect(result?.data.map((entry) => entry.granted)).toEqual([true, true])
    expect(systemGroups.resolveState).not.toHaveBeenCalled()

    instance.dispose()
  })

  it('grants only the members of a group whose filter matches the document', async () => {
    vi.mocked(systemGroups.resolveState).mockResolvedValue([
      {members: ['p-ada'], grants: [{filter: '_type == "article"', permissions: ['read']}]},
      {members: ['p-grace'], grants: [{filter: '_type == "report"', permissions: ['read']}]},
    ])

    const result = await resolveUsersWithGrants(instance, {projectId: 'p', document})

    expect(result?.data).toEqual([
      {...ada, granted: true},
      {...grace, granted: false},
    ])
    expect(systemGroups.resolveState).toHaveBeenCalledWith(instance, {
      projectId: 'p',
      dataset: 'd',
    })

    instance.dispose()
  })

  it('measures the requested grant rather than always read', async () => {
    vi.mocked(systemGroups.resolveState).mockResolvedValue([
      {members: ['p-ada'], grants: [{filter: 'true', permissions: ['read']}]},
      {members: ['p-grace'], grants: [{filter: 'true', permissions: ['read', 'update']}]},
    ])

    const result = await resolveUsersWithGrants(instance, {
      projectId: 'p',
      document,
      grant: 'update',
    })

    expect(result?.data).toEqual([
      {...ada, granted: false},
      {...grace, granted: true},
    ])

    instance.dispose()
  })

  it('denies users who belong to no group at all', async () => {
    vi.mocked(systemGroups.resolveState).mockResolvedValue([
      {members: ['p-ada'], grants: [{filter: 'true', permissions: ['read']}]},
    ])

    const result = await resolveUsersWithGrants(instance, {projectId: 'p', document})

    expect(result?.data.map((entry) => [entry.profile.displayName, entry.granted])).toEqual([
      ['Ada', true],
      ['Grace', false],
    ])

    instance.dispose()
  })

  it('denies only the unevaluable grant, not the others beside it', async () => {
    vi.mocked(systemGroups.resolveState).mockResolvedValue([
      {
        members: ['p-ada'],
        grants: [
          // Needs data the client doesn't have, so it cannot be answered here.
          {filter: 'defined(user::attributes())', permissions: ['read']},
          {filter: '_type == "article"', permissions: ['read']},
        ],
      },
      {
        members: ['p-grace'],
        grants: [{filter: 'defined(user::attributes())', permissions: ['read']}],
      },
    ])

    const result = await resolveUsersWithGrants(instance, {projectId: 'p', document})

    // Ada keeps the grant that does evaluate; Grace has nothing else to fall back on.
    expect(result?.data.map((entry) => entry.granted)).toEqual([true, false])

    instance.dispose()
  })

  it('denies a grant whose filter is not valid GROQ', async () => {
    vi.mocked(systemGroups.resolveState).mockResolvedValue([
      {
        members: ['p-ada', 'p-grace'],
        grants: [{filter: '_type ==== "article"', permissions: ['read']}],
      },
      {members: ['p-ada'], grants: [{filter: 'true', permissions: ['read']}]},
    ])

    const result = await resolveUsersWithGrants(instance, {projectId: 'p', document})

    expect(result?.data.map((entry) => entry.granted)).toEqual([true, false])

    instance.dispose()
  })

  it('grants everyone when the document does not exist', async () => {
    vi.mocked(resolveDocument).mockResolvedValue(null)
    vi.mocked(systemGroups.resolveState).mockResolvedValue([
      {members: ['p-ada'], grants: [{filter: '_type == "report"', permissions: ['read']}]},
    ])

    const result = await resolveUsersWithGrants(instance, {projectId: 'p', document})

    expect(result?.data.map((entry) => entry.granted)).toEqual([true, true])

    instance.dispose()
  })

  it('denies a user with no project membership to identify them by', async () => {
    // An organization member who was never added to the project has no project
    // user id, so no access group can name them.
    mockUsers([ada, user('mallory', 'Mallory')])
    vi.mocked(systemGroups.resolveState).mockResolvedValue([
      {members: ['p-ada', 'p-mallory'], grants: [{filter: 'true', permissions: ['read']}]},
    ])

    const result = await resolveUsersWithGrants(instance, {projectId: 'p', document})

    expect(result?.data.map((entry) => entry.granted)).toEqual([true, false])

    instance.dispose()
  })

  it('grants everyone through the public group sentinel', async () => {
    vi.mocked(systemGroups.resolveState).mockResolvedValue([
      {members: ['everyone'], grants: [{filter: '_id in path("*")', permissions: ['read']}]},
    ])

    const result = await resolveUsersWithGrants(instance, {projectId: 'p', document})

    expect(result?.data.map((entry) => entry.granted)).toEqual([true, true])

    instance.dispose()
  })

  describe('organization audience', () => {
    // An organization users read returns no project user id, so these carry a
    // project membership with no `resourceUserId` on it.
    const orgUser = (id: string, displayName: string, inProject: boolean): SanityUser => ({
      ...user(id, displayName),
      memberships: [
        {resourceType: 'organization', resourceId: 'org-1', roleNames: ['member']},
        ...(inProject ? [{resourceType: 'project', resourceId: 'p', roleNames: ['editor']}] : []),
      ],
    })

    const orgOptions = {
      resourceType: 'organization',
      organizationId: 'org-1',
      document,
    } as const

    it('looks the project user ids up so members still get real grants', async () => {
      mockUsers([orgUser('ada', 'Ada', true), orgUser('bob', 'Bob', true)])
      vi.mocked(projectUserIds.resolveState).mockResolvedValue(
        new Map([
          ['g-ada', 'p-ada'],
          ['g-bob', 'p-bob'],
        ]),
      )
      vi.mocked(systemGroups.resolveState).mockResolvedValue([
        {members: ['p-ada'], grants: [{filter: '_type == "article"', permissions: ['read']}]},
        {members: ['p-bob'], grants: [{filter: '_type == "report"', permissions: ['read']}]},
      ])

      const result = await resolveUsersWithGrants(instance, orgOptions)

      expect(result?.data.map((entry) => entry.granted)).toEqual([true, false])
      expect(projectUserIds.resolveState).toHaveBeenCalledWith(instance, 'p')

      instance.dispose()
    })

    it('denies organization members who are not in the project', async () => {
      mockUsers([orgUser('ada', 'Ada', true), orgUser('mallory', 'Mallory', false)])
      vi.mocked(projectUserIds.resolveState).mockResolvedValue(new Map([['g-ada', 'p-ada']]))
      vi.mocked(systemGroups.resolveState).mockResolvedValue([
        {members: ['p-ada'], grants: [{filter: 'true', permissions: ['read']}]},
      ])

      const result = await resolveUsersWithGrants(instance, orgOptions)

      expect(result?.data.map((entry) => entry.granted)).toEqual([true, false])

      instance.dispose()
    })

    it('rebuilds the map for a member it cannot explain, and annotates with the rebuild', async () => {
      mockUsers([orgUser('ada', 'Ada', true), orgUser('newcomer', 'Newcomer', true)])
      vi.mocked(projectUserIds.resolveState).mockResolvedValue(new Map([['g-ada', 'p-ada']]))
      vi.mocked(projectUserIds.refetch).mockResolvedValue(
        new Map([
          ['g-ada', 'p-ada'],
          ['g-newcomer', 'p-newcomer'],
        ]),
      )
      vi.mocked(systemGroups.resolveState).mockResolvedValue([
        {members: ['p-ada', 'p-newcomer'], grants: [{filter: 'true', permissions: ['read']}]},
      ])

      const result = await resolveUsersWithGrants(instance, orgOptions)

      expect(projectUserIds.refetch).toHaveBeenCalledWith(instance, 'p')
      expect(result?.data.map((entry) => entry.granted)).toEqual([true, true])

      instance.dispose()
    })

    it('does not rebuild for a member of the organization but not the project', async () => {
      mockUsers([orgUser('ada', 'Ada', true), orgUser('mallory', 'Mallory', false)])
      vi.mocked(projectUserIds.resolveState).mockResolvedValue(new Map([['g-ada', 'p-ada']]))
      vi.mocked(systemGroups.resolveState).mockResolvedValue([
        {members: ['p-ada'], grants: [{filter: 'true', permissions: ['read']}]},
      ])

      await resolveUsersWithGrants(instance, orgOptions)

      expect(projectUserIds.refetch).not.toHaveBeenCalled()

      instance.dispose()
    })

    it('rebuilds only once for a member no rebuild ever explains', async () => {
      const partial = new Map([['g-ada', 'p-ada']])
      mockUsers([orgUser('ada', 'Ada', true), orgUser('ghost', 'Ghost', true)])
      vi.mocked(projectUserIds.resolveState).mockResolvedValue(partial)
      vi.mocked(projectUserIds.refetch).mockResolvedValue(partial)
      vi.mocked(systemGroups.resolveState).mockResolvedValue([
        {members: ['p-ada'], grants: [{filter: 'true', permissions: ['read']}]},
      ])

      await resolveUsersWithGrants(instance, orgOptions)
      const result = await resolveUsersWithGrants(instance, orgOptions)

      expect(projectUserIds.refetch).toHaveBeenCalledTimes(1)
      expect(result?.data.map((entry) => entry.granted)).toEqual([true, false])

      instance.dispose()
    })

    it('does not read the id map when there is no document', async () => {
      await resolveUsersWithGrants(instance, {
        resourceType: 'organization',
        organizationId: 'org-1',
      })

      expect(projectUserIds.resolveState).not.toHaveBeenCalled()

      instance.dispose()
    })

    it('does not read the id map for a project read that also carries an organization id', async () => {
      // `usersStore` lets an explicit `resourceType` win over either id, so
      // this is a project read and its ids arrive inline.
      vi.mocked(systemGroups.resolveState).mockResolvedValue([
        {members: ['p-ada'], grants: [{filter: 'true', permissions: ['read']}]},
      ])

      const result = await resolveUsersWithGrants(instance, {
        resourceType: 'project',
        projectId: 'p',
        organizationId: 'org-1',
        document,
      })

      expect(projectUserIds.resolveState).not.toHaveBeenCalled()
      expect(result?.data.map((entry) => entry.granted)).toEqual([true, false])

      instance.dispose()
    })

    describe('rebuild failures', () => {
      const fullMap = () =>
        new Map([
          ['g-ada', 'p-ada'],
          ['g-newcomer', 'p-newcomer'],
        ])

      beforeEach(() => {
        mockUsers([orgUser('ada', 'Ada', true), orgUser('newcomer', 'Newcomer', true)])
        vi.mocked(projectUserIds.resolveState).mockResolvedValue(new Map([['g-ada', 'p-ada']]))
        vi.mocked(systemGroups.resolveState).mockResolvedValue([
          {members: ['p-ada', 'p-newcomer'], grants: [{filter: 'true', permissions: ['read']}]},
        ])
      })

      it('serves the map it has when the rebuild fails, rather than failing the read', async () => {
        vi.mocked(projectUserIds.refetch).mockRejectedValue(new Error('network blip'))

        const result = await resolveUsersWithGrants(instance, orgOptions)

        // A best-effort accuracy fix must not reject: this backs a suspense
        // promise, so rejecting would blank the component over a blip.
        expect(result?.data.map((entry) => entry.granted)).toEqual([true, false])

        instance.dispose()
      })

      it('retries after a failed rebuild instead of giving up on the user', async () => {
        vi.mocked(projectUserIds.refetch)
          .mockRejectedValueOnce(new Error('network blip'))
          .mockResolvedValueOnce(fullMap())

        await resolveUsersWithGrants(instance, orgOptions)
        const second = await resolveUsersWithGrants(instance, orgOptions)

        expect(projectUserIds.refetch).toHaveBeenCalledTimes(2)
        expect(second?.data.map((entry) => entry.granted)).toEqual([true, true])

        instance.dispose()
      })

      it('leaves no unhandled rejection when a rebuild fails behind the state source', async () => {
        // Stubbed raw rather than with `vi.fn`, which records settled results by
        // attaching its own handlers and so masks the very failure this covers.
        const original = projectUserIds.refetch
        Object.assign(projectUserIds, {
          refetch: () => Promise.reject(new Error('map rebuild exploded')),
        })

        const unhandled: unknown[] = []
        const onUnhandled = (error: unknown) => unhandled.push(error)
        process.on('unhandledRejection', onUnhandled)

        vi.mocked(getDocumentState).mockReturnValue({
          getCurrent: () => article,
          subscribe: () => () => {},
          observable: NEVER,
        } as unknown as StateSource<SanityDocument | null | undefined>)
        vi.mocked(systemGroups.getState).mockReturnValue({
          getCurrent: () => ({
            status: 'success',
            data: [
              {members: ['p-ada', 'p-newcomer'], grants: [{filter: 'true', permissions: ['read']}]},
            ],
          }),
          subscribe: () => () => {},
          observable: NEVER,
        } as unknown as StateSource<FetcherSnapshot<SystemGroup[]>>)
        vi.mocked(projectUserIds.getState).mockReturnValue({
          getCurrent: () => ({status: 'success', data: new Map([['g-ada', 'p-ada']])}),
          subscribe: () => () => {},
          observable: NEVER,
        } as unknown as StateSource<FetcherSnapshot<ProjectUserIds>>)

        const state = getUsersWithGrantsState(instance, orgOptions)
        const unsubscribe = state.subscribe()
        await new Promise((resolve) => setTimeout(resolve, 20))

        expect(state.getCurrent()?.data.map((entry) => entry.granted)).toEqual([true, false])
        expect(unhandled).toEqual([])

        process.off('unhandledRejection', onUnhandled)
        Object.assign(projectUserIds, {refetch: original})
        unsubscribe()
        instance.dispose()
      })
    })

    it('does not read the id map for a project audience, which has the ids inline', async () => {
      vi.mocked(systemGroups.resolveState).mockResolvedValue([
        {members: ['p-ada'], grants: [{filter: 'true', permissions: ['read']}]},
      ])

      const result = await resolveUsersWithGrants(instance, {projectId: 'p', document})

      expect(result?.data.map((entry) => entry.granted)).toEqual([true, false])
      expect(projectUserIds.resolveState).not.toHaveBeenCalled()

      instance.dispose()
    })
  })

  it('rejects a document on a resource that has no dataset', () => {
    const mediaLibrary = createSanityInstance({resource: {mediaLibraryId: 'ml-1'}})

    expect(() => getUsersWithGrantsState(mediaLibrary, {document})).toThrow(
      /only supported for dataset resources/,
    )

    mediaLibrary.dispose()
    instance.dispose()
  })

  describe('state source', () => {
    const usersArrived = async (state: StateSource<unknown>) => {
      const unsubscribe = state.subscribe()
      await new Promise((resolve) => setTimeout(resolve, 10))
      return unsubscribe
    }

    const mockGroups = (snapshot: Partial<FetcherSnapshot<SystemGroup[]>>) => {
      vi.mocked(systemGroups.getState).mockReturnValue({
        getCurrent: () => snapshot as FetcherSnapshot<SystemGroup[]>,
        subscribe: () => () => {},
        observable: NEVER,
      } as unknown as StateSource<FetcherSnapshot<SystemGroup[]>>)
    }

    beforeEach(() => {
      vi.mocked(getDocumentState).mockReturnValue({
        getCurrent: () => article,
        subscribe: () => () => {},
        observable: of(article),
      } as unknown as StateSource<SanityDocument | null | undefined>)
    })

    it('stays undefined while the access groups are still loading', async () => {
      mockGroups({status: 'pending'})

      const state = getUsersWithGrantsState(instance, {projectId: 'p', document})
      const unsubscribe = await usersArrived(state)

      // Annotating against a half-known set of groups would report users as
      // denied when the answer simply isn't in yet.
      expect(state.getCurrent()).toBeUndefined()

      unsubscribe()
      instance.dispose()
    })

    it('surfaces an access group read failure rather than granting everyone', async () => {
      mockGroups({status: 'error', error: new Error('no access to system.group')})

      const state = getUsersWithGrantsState(instance, {projectId: 'p', document})
      const unsubscribe = await usersArrived(state)

      expect(() => state.getCurrent()).toThrow('no access to system.group')

      unsubscribe()
      instance.dispose()
    })

    it('returns a stable snapshot while its inputs are unchanged', async () => {
      mockGroups({
        status: 'success',
        data: [{members: ['p-ada'], grants: [{filter: 'true', permissions: ['read']}]}],
      })

      const state = getUsersWithGrantsState(instance, {projectId: 'p', document})
      const unsubscribe = await usersArrived(state)

      // `useSyncExternalStore` loops on a snapshot that changes identity.
      expect(state.getCurrent()).toBe(state.getCurrent())
      expect(state.getCurrent()?.data.map((entry) => entry.granted)).toEqual([true, false])

      unsubscribe()
      instance.dispose()
    })
  })

  describe('keys', () => {
    it('separates reads that differ only by grant', () => {
      expect(getUsersWithGrantsKey(instance, {document, grant: 'read'})).not.toEqual(
        getUsersWithGrantsKey(instance, {document, grant: 'update'}),
      )

      instance.dispose()
    })

    it('separates reads that differ only by document', () => {
      expect(getUsersWithGrantsKey(instance, {document})).not.toEqual(
        getUsersWithGrantsKey(instance, {
          document: {documentId: 'article-2', documentType: 'article'},
        }),
      )

      instance.dispose()
    })

    it('is stable across the key order of a caller object literal', () => {
      expect(
        getUsersWithGrantsKey(instance, {
          document: {documentType: 'article', documentId: 'article-1'},
        }),
      ).toEqual(getUsersWithGrantsKey(instance, {document}))

      instance.dispose()
    })

    it('round-trips the document and grant', () => {
      const parsed = parseUsersWithGrantsKey(
        getUsersWithGrantsKey(instance, {
          projectId: 'p',
          displayName: 'ada',
          document,
          grant: 'update',
        }),
      )

      expect(parsed).toMatchObject({
        projectId: 'p',
        displayName: 'ada',
        grant: 'update',
        document: expect.objectContaining({documentId: 'article-1', documentType: 'article'}),
      })

      instance.dispose()
    })

    it('omits the document when there is none', () => {
      expect(
        parseUsersWithGrantsKey(getUsersWithGrantsKey(instance, {projectId: 'p'})),
      ).not.toHaveProperty('document')

      instance.dispose()
    })
  })
})
