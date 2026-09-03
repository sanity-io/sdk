import {type SanityClient} from '@sanity/client'
import {of} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {getClientState} from '../client/clientStore'
import {createSanityInstance, type SanityInstance} from '../store/createSanityInstance'
import {type StateSource} from '../store/createStateSourceAction'
import {projectUserIds} from './projectUserIds'
import {type SanityUser, type SanityUserResponse} from './types'
import {PROJECT_USER_IDS_MAX_PAGES} from './usersConstants'

vi.mock('../client/clientStore')

const member = (id: string, projectUserId?: string, resourceId = 'p'): SanityUser => ({
  sanityUserId: `g-${id}`,
  profile: {
    id: `g-${id}`,
    displayName: id,
    email: `${id}@example.com`,
    provider: 'google',
    createdAt: '2023-01-01T00:00:00Z',
  },
  memberships: [
    {resourceType: 'project', resourceId, roleNames: ['editor'], resourceUserId: projectUserId},
  ],
})

const page = (data: SanityUser[], nextCursor: string | null): SanityUserResponse => ({
  data,
  totalCount: data.length,
  nextCursor,
})

describe('projectUserIds', () => {
  let instance: SanityInstance
  let request: ReturnType<typeof vi.fn>

  beforeEach(() => {
    instance = createSanityInstance({projectId: 'p', dataset: 'd'})
    request = vi.fn()
    vi.mocked(getClientState).mockReturnValue({
      observable: of({observable: {request}} as unknown as SanityClient),
    } as StateSource<SanityClient>)
  })

  afterEach(() => {
    instance.dispose()
  })

  it('maps each account-wide id to its project user id', async () => {
    request.mockReturnValueOnce(of(page([member('ada', 'p-ada'), member('bob', 'p-bob')], null)))

    const ids = await projectUserIds.resolveState(instance, 'p')

    expect([...ids.entries()]).toEqual([
      ['g-ada', 'p-ada'],
      ['g-bob', 'p-bob'],
    ])
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        uri: 'access/project/p/users',
        tag: 'users.project-user-ids',
      }),
    )
  })

  it('follows the cursor to the end so no member is missing from the map', async () => {
    request
      .mockReturnValueOnce(of(page([member('ada', 'p-ada')], 'page-2')))
      .mockReturnValueOnce(of(page([member('bob', 'p-bob')], 'page-3')))
      .mockReturnValueOnce(of(page([member('cyd', 'p-cyd')], null)))

    const ids = await projectUserIds.resolveState(instance, 'p')

    expect([...ids.keys()]).toEqual(['g-ada', 'g-bob', 'g-cyd'])
    expect(request).toHaveBeenCalledTimes(3)
    expect(request.mock.calls[1][0].query).toMatchObject({nextCursor: 'page-2'})
  })

  it('skips members of another project and members with no project user id', async () => {
    request.mockReturnValueOnce(
      of(
        page(
          [member('ada', 'p-ada'), member('bob', 'p-bob', 'other-project'), member('cyd')],
          null,
        ),
      ),
    )

    const ids = await projectUserIds.resolveState(instance, 'p')

    expect([...ids.keys()]).toEqual(['g-ada'])
  })

  it('fails loudly rather than returning a truncated map', async () => {
    // A partial map would report real members as having no access.
    request.mockReturnValue(of(page([member('ada', 'p-ada')], 'always-more')))

    await expect(projectUserIds.resolveState(instance, 'p')).rejects.toThrow(
      /more than \d+ members/,
    )
    expect(request).toHaveBeenCalledTimes(PROJECT_USER_IDS_MAX_PAGES)
  })

  it('caches per project', async () => {
    request.mockReturnValue(of(page([member('ada', 'p-ada')], null)))

    await projectUserIds.resolveState(instance, 'p')
    await projectUserIds.resolveState(instance, 'p')
    expect(request).toHaveBeenCalledTimes(1)

    await projectUserIds.resolveState(instance, 'other')
    expect(request).toHaveBeenCalledTimes(2)
  })
})
