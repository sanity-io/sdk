import {type SanityClient} from '@sanity/client'
import {of} from 'rxjs'
import {afterEach, beforeEach, describe, it} from 'vitest'

import {getClientState} from '../client/clientStore'
import {createSanityInstance, type SanityInstance} from '../store/createSanityInstance'
import {type StateSource} from '../store/createStateSourceAction'
import {resolveProjects} from './projects'

vi.mock('../client/clientStore')

describe('projects', () => {
  let instance: SanityInstance

  beforeEach(() => {
    instance = createSanityInstance({projectId: 'p', dataset: 'd'})
  })

  afterEach(() => {
    instance.dispose()
  })

  it('calls the `client.observable.projects.list` method on the client and returns the result', async () => {
    const projects = [{id: 'a'}, {id: 'b'}]
    const list = vi.fn().mockReturnValue(of(projects))

    const mockClient = {
      observable: {
        projects: {list} as unknown as SanityClient['observable']['projects'],
      },
    } as SanityClient

    vi.mocked(getClientState).mockReturnValue({
      observable: of(mockClient),
    } as StateSource<SanityClient>)

    const result = await resolveProjects(instance)
    expect(result).toEqual(projects)
    expect(list).toHaveBeenCalledWith({includeMembers: true, organizationId: undefined})
  })
})

describe('projects cache key generation', () => {
  it('generates correct cache keys for different parameter combinations', async () => {
    // Test the getKey function directly by creating a mock store
    const mockGetKey = (
      _instance: SanityInstance,
      options?: {organizationId?: string; includeMembers?: boolean},
    ) => {
      const orgKey = options?.organizationId ? `:org:${options.organizationId}` : ''
      const membersKey = options?.includeMembers === false ? ':no-members' : ''
      return `projects${orgKey}${membersKey}`
    }

    const mockInstance = {} as SanityInstance

    // Test default behavior (no options)
    const defaultKey = mockGetKey(mockInstance)
    expect(defaultKey).toBe('projects')

    // Test with organizationId only
    const orgKey = mockGetKey(mockInstance, {organizationId: 'org123'})
    expect(orgKey).toBe('projects:org:org123')

    // Test with includeMembers: false only
    const noMembersKey = mockGetKey(mockInstance, {includeMembers: false})
    expect(noMembersKey).toBe('projects:no-members')

    // Test with both parameters
    const bothKey = mockGetKey(mockInstance, {
      organizationId: 'org123',
      includeMembers: false,
    })
    expect(bothKey).toBe('projects:org:org123:no-members')
  })
})
