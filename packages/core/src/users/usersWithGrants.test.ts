import {type SanityClient} from '@sanity/client'
import {type SanityDocument} from '@sanity/types'
import {delay, NEVER, of} from 'rxjs'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {getClient, getClientState} from '../client/clientStore'
import {getDocumentState, resolveDocument} from '../document/documentStore'
import {createSanityInstance, type SanityInstance} from '../store/createSanityInstance'
import {type StateSource} from '../store/createStateSourceAction'
import {type FetcherSnapshot} from '../store/fetcherStore'
import {type SystemGroup, systemGroups} from './systemGroups'
import {type SanityUser, type SanityUserResponse} from './types'
import {DEFAULT_USERS_BATCH_SIZE} from './usersConstants'
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
  let usersRequest: ReturnType<typeof vi.fn>

  const mockUsers = (users: SanityUser[]) => {
    const response: SanityUserResponse = {
      data: users,
      totalCount: users.length,
      nextCursor: null,
    }
    usersRequest = vi.fn().mockReturnValue(of(response).pipe(delay(0)))

    vi.mocked(getClientState).mockReturnValue({
      observable: of({observable: {request: usersRequest}} as unknown as SanityClient),
    } as StateSource<SanityClient>)
    vi.mocked(getClient).mockReturnValue({
      observable: {request: usersRequest},
    } as unknown as SanityClient)
  }

  beforeEach(() => {
    vi.clearAllMocks()
    instance = createSanityInstance({projectId: 'p', dataset: 'd'})
    mockUsers([ada, grace])
    vi.mocked(resolveDocument).mockResolvedValue(article)
  })

  it('grants only the members of a group whose filter matches the document', async () => {
    vi.mocked(systemGroups.resolveState).mockResolvedValue([
      {members: ['p-ada'], grants: [{filter: '_type == "article"', permissions: ['read']}]},
      {members: ['p-grace'], grants: [{filter: '_type == "report"', permissions: ['read']}]},
    ])

    const result = await resolveUsersWithGrants(instance, {document})

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

  it('measures read rather than any other permission a group grants', async () => {
    // Visibility is the question, so a group that can update without being able
    // to read is not what makes a user available to a picker.
    vi.mocked(systemGroups.resolveState).mockResolvedValue([
      {members: ['p-ada'], grants: [{filter: 'true', permissions: ['read']}]},
      {members: ['p-grace'], grants: [{filter: 'true', permissions: ['update']}]},
    ])

    const result = await resolveUsersWithGrants(instance, {document})

    expect(result?.data).toEqual([
      {...ada, granted: true},
      {...grace, granted: false},
    ])

    instance.dispose()
  })

  it('denies users who belong to no group at all', async () => {
    vi.mocked(systemGroups.resolveState).mockResolvedValue([
      {members: ['p-ada'], grants: [{filter: 'true', permissions: ['read']}]},
    ])

    const result = await resolveUsersWithGrants(instance, {document})

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

    const result = await resolveUsersWithGrants(instance, {document})

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

    const result = await resolveUsersWithGrants(instance, {document})

    expect(result?.data.map((entry) => entry.granted)).toEqual([true, false])

    instance.dispose()
  })

  it('denies everyone when the document does not exist', async () => {
    // A grant is a filter measured against a document. With no document there
    // is nothing anyone can be shown to hold, and reporting the whole project
    // as able to read something that is not there is the worse answer.
    vi.mocked(resolveDocument).mockResolvedValue(null)
    vi.mocked(systemGroups.resolveState).mockResolvedValue([
      {members: ['p-ada'], grants: [{filter: 'true', permissions: ['read']}]},
    ])

    const result = await resolveUsersWithGrants(instance, {document})

    expect(result?.data.map((entry) => entry.granted)).toEqual([false, false])

    instance.dispose()
  })

  it('denies a user with no project membership to identify them by', async () => {
    // An organization member who was never added to the project has no project
    // user id, so no access group can name them.
    mockUsers([ada, user('mallory', 'Mallory')])
    vi.mocked(systemGroups.resolveState).mockResolvedValue([
      {members: ['p-ada', 'p-mallory'], grants: [{filter: 'true', permissions: ['read']}]},
    ])

    const result = await resolveUsersWithGrants(instance, {document})

    expect(result?.data.map((entry) => entry.granted)).toEqual([true, false])

    instance.dispose()
  })

  it('grants everyone through the public group sentinel', async () => {
    vi.mocked(systemGroups.resolveState).mockResolvedValue([
      {members: ['everyone'], grants: [{filter: '_id in path("*")', permissions: ['read']}]},
    ])

    const result = await resolveUsersWithGrants(instance, {document})

    expect(result?.data.map((entry) => entry.granted)).toEqual([true, true])

    instance.dispose()
  })

  it('always reads the project audience, which carries the project user ids', async () => {
    // Access groups name their members by project user id, and only a project
    // users read returns one inline, so the audience is not the caller's to pick.
    vi.mocked(systemGroups.resolveState).mockResolvedValue([
      {members: ['p-ada'], grants: [{filter: 'true', permissions: ['read']}]},
    ])

    await resolveUsersWithGrants(instance, {document})

    expect(usersRequest).toHaveBeenCalledWith(
      expect.objectContaining({url: 'access/project/p/users'}),
    )

    instance.dispose()
  })

  it('reads the users of the document’s project, not the ambient one', async () => {
    // A project user id means nothing outside its own project, so reading users
    // from one project and measuring them against another's groups would deny
    // everybody.
    vi.mocked(systemGroups.resolveState).mockResolvedValue([])

    await resolveUsersWithGrants(instance, {
      document: {...document, resource: {projectId: 'other', dataset: 'other-dataset'}},
    })

    expect(usersRequest).toHaveBeenCalledWith(
      expect.objectContaining({url: 'access/project/other/users'}),
    )
    expect(systemGroups.resolveState).toHaveBeenCalledWith(instance, {
      projectId: 'other',
      dataset: 'other-dataset',
    })

    instance.dispose()
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

      const state = getUsersWithGrantsState(instance, {document})
      const unsubscribe = await usersArrived(state)

      // Annotating against a half-known set of groups would report users as
      // denied when the answer simply isn't in yet.
      expect(state.getCurrent()).toBeUndefined()

      unsubscribe()
      instance.dispose()
    })

    it('surfaces an access group read failure rather than granting everyone', async () => {
      mockGroups({status: 'error', error: new Error('no access to system.group')})

      const state = getUsersWithGrantsState(instance, {document})
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

      const state = getUsersWithGrantsState(instance, {document})
      const unsubscribe = await usersArrived(state)

      // `useSyncExternalStore` loops on a snapshot that changes identity.
      expect(state.getCurrent()).toBe(state.getCurrent())
      expect(state.getCurrent()?.data.map((entry) => entry.granted)).toEqual([true, false])

      unsubscribe()
      instance.dispose()
    })
  })

  describe('keys', () => {
    it('separates reads that differ only by search terms', () => {
      expect(getUsersWithGrantsKey({document, displayName: 'ada'})).not.toEqual(
        getUsersWithGrantsKey({document, displayName: 'grace'}),
      )

      instance.dispose()
    })

    it('separates reads that differ only by document', () => {
      expect(getUsersWithGrantsKey({document})).not.toEqual(
        getUsersWithGrantsKey({
          document: {documentId: 'article-2', documentType: 'article'},
        }),
      )

      instance.dispose()
    })

    it('is stable across the key order of a caller object literal', () => {
      expect(
        getUsersWithGrantsKey({
          document: {documentType: 'article', documentId: 'article-1'},
        }),
      ).toEqual(getUsersWithGrantsKey({document}))

      instance.dispose()
    })

    it('round-trips the search terms and the document', () => {
      // React reads and resolves against the parsed key rather than the options
      // it was handed, so anything the key loses is a field the read ignores.
      const parsed = parseUsersWithGrantsKey(
        getUsersWithGrantsKey({
          document,
          batchSize: 25,
          displayName: 'ada',
          email: 'ada@example.com',
          sortBy: 'displayName',
          orderBy: 'desc',
        }),
      )

      expect(parsed).toEqual({
        document: {documentId: 'article-1', documentType: 'article'},
        batchSize: 25,
        displayName: 'ada',
        email: 'ada@example.com',
        sortBy: 'displayName',
        orderBy: 'desc',
      })

      instance.dispose()
    })

    it('keys the default batch size explicitly', () => {
      // Otherwise asking for the default and not asking at all would be two
      // keys over one entry.
      expect(getUsersWithGrantsKey({document})).toEqual(
        getUsersWithGrantsKey({document, batchSize: DEFAULT_USERS_BATCH_SIZE}),
      )

      instance.dispose()
    })
  })
})
