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

  it('calls `client.observable.request` against `/projects` and returns the result', async () => {
    const projects = [{id: 'a'}, {id: 'b'}]
    const request = vi.fn().mockReturnValue(of(projects))

    const mockClient = {
      observable: {request} as unknown as SanityClient['observable'],
    } as SanityClient

    vi.mocked(getClientState).mockReturnValue({
      observable: of(mockClient),
    } as StateSource<SanityClient>)

    const result = await resolveProjects(instance)
    expect(result).toEqual(projects)
    expect(request).toHaveBeenCalledWith({
      uri: '/projects',
      query: {includeMembers: 'false', includeFeatures: 'true', onlyExplicitMembership: 'false'},
    })
  })

  it('serializes query params (booleans → strings) and omits undefined values', async () => {
    const request = vi.fn().mockReturnValue(of([]))
    const mockClient = {
      observable: {request} as unknown as SanityClient['observable'],
    } as SanityClient

    vi.mocked(getClientState).mockReturnValue({
      observable: of(mockClient),
    } as StateSource<SanityClient>)

    await resolveProjects(instance, {
      organizationId: 'org123',
      includeMembers: true,
      includeFeatures: false,
    })

    expect(request).toHaveBeenCalledWith({
      uri: '/projects',
      query: {
        organizationId: 'org123',
        includeMembers: 'true',
        includeFeatures: 'false',
        onlyExplicitMembership: 'false',
      },
    })
  })
})

describe('projects cache key generation', () => {
  const mockGetKey = (
    _instance: SanityInstance,
    options?: {
      organizationId?: string
      includeMembers?: boolean
      includeFeatures?: boolean
      onlyExplicitMembership?: boolean
    },
  ) => {
    const organizationId = options?.organizationId
    const includeMembers = options?.includeMembers ?? false
    const includeFeatures = options?.includeFeatures ?? true
    const onlyExplicitMembership = options?.onlyExplicitMembership ?? false
    const orgKey = organizationId ? `:org:${organizationId}` : ''
    const membersKey = includeMembers ? ':members' : ''
    const featuresKey = includeFeatures ? ':features' : ''
    const explicitKey = onlyExplicitMembership ? ':explicit' : ''
    return `projects${orgKey}${membersKey}${featuresKey}${explicitKey}`
  }

  const mockInstance = {} as SanityInstance

  it('default call includes :features (default-true) and excludes :members (default-false)', () => {
    expect(mockGetKey(mockInstance)).toBe('projects:features')
  })

  it('treats undefined and the matching default as the same key', () => {
    expect(mockGetKey(mockInstance)).toBe(
      mockGetKey(mockInstance, {includeMembers: false, includeFeatures: true}),
    )
  })

  it('treats raw and explicit defaults equivalently', () => {
    expect(mockGetKey(mockInstance, {organizationId: 'org123'})).toBe(
      mockGetKey(mockInstance, {
        organizationId: 'org123',
        includeMembers: false,
        includeFeatures: true,
        onlyExplicitMembership: false,
      }),
    )
  })

  it('explicit includeFeatures: false drops the :features segment', () => {
    expect(mockGetKey(mockInstance, {includeFeatures: false})).toBe('projects')
  })

  it('appends an org segment when organizationId is set', () => {
    expect(mockGetKey(mockInstance, {organizationId: 'org123'})).toBe(
      'projects:org:org123:features',
    )
  })

  it('appends :members when includeMembers is true', () => {
    expect(mockGetKey(mockInstance, {includeMembers: true})).toBe('projects:members:features')
  })

  it('combines all segments in order', () => {
    expect(
      mockGetKey(mockInstance, {
        organizationId: 'org123',
        includeMembers: true,
        includeFeatures: true,
        onlyExplicitMembership: true,
      }),
    ).toBe('projects:org:org123:members:features:explicit')
  })

  it('produces distinct keys for each meaningful option permutation', () => {
    const keys = new Set([
      mockGetKey(mockInstance),
      mockGetKey(mockInstance, {includeMembers: true}),
      mockGetKey(mockInstance, {includeFeatures: false}),
      mockGetKey(mockInstance, {includeMembers: true, includeFeatures: false}),
      mockGetKey(mockInstance, {onlyExplicitMembership: true}),
      mockGetKey(mockInstance, {organizationId: 'a'}),
      mockGetKey(mockInstance, {organizationId: 'b'}),
    ])
    expect(keys.size).toBe(7)
  })
})
