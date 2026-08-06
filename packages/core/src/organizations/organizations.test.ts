import {type SanityClient} from '@sanity/client'
import {of} from 'rxjs'
import {afterEach, beforeEach, describe, it} from 'vitest'

import {getClientState} from '../client/clientStore'
import {createSanityInstance, type SanityInstance} from '../store/createSanityInstance'
import {type StateSource} from '../store/createStateSourceAction'
import {getOrganizationsCacheKey, organizations} from './organizations'

vi.mock('../client/clientStore')

describe('organizations', () => {
  let instance: SanityInstance

  beforeEach(() => {
    instance = createSanityInstance({projectId: 'p', dataset: 'd'})
  })

  afterEach(() => {
    instance.dispose()
  })

  it('calls `client.observable.request` against `/organizations` and returns the result', async () => {
    const list = [{id: 'org_1'}, {id: 'org_2'}]
    const request = vi.fn().mockReturnValue(of(list))

    const mockClient = {
      observable: {request} as unknown as SanityClient['observable'],
    } as SanityClient

    vi.mocked(getClientState).mockReturnValue({
      observable: of(mockClient),
    } as StateSource<SanityClient>)

    const result = await organizations.resolveState(instance)
    expect(result).toEqual(list)
    expect(request).toHaveBeenCalledWith({
      uri: '/organizations',
      query: {
        includeImplicitMemberships: 'false',
        includeMembers: 'false',
        includeFeatures: 'false',
      },
      tag: 'organizations.list',
    })
  })

  it('serializes query params (booleans → strings) and respects flags', async () => {
    const request = vi.fn().mockReturnValue(of([]))
    const mockClient = {
      observable: {request} as unknown as SanityClient['observable'],
    } as SanityClient

    vi.mocked(getClientState).mockReturnValue({
      observable: of(mockClient),
    } as StateSource<SanityClient>)

    await organizations.resolveState(instance, {
      includeMembers: true,
      includeFeatures: true,
      includeImplicitMemberships: true,
    })

    expect(request).toHaveBeenCalledWith({
      uri: '/organizations',
      query: {
        includeImplicitMemberships: 'true',
        includeMembers: 'true',
        includeFeatures: 'true',
      },
      tag: 'organizations.list',
    })
  })
})

describe('organizations cache key generation', () => {
  let instance: SanityInstance

  beforeEach(() => {
    instance = createSanityInstance({})
  })

  afterEach(() => {
    instance.dispose()
  })

  it('default call excludes all segments (all flags default-false)', () => {
    expect(getOrganizationsCacheKey(instance)).toBe('organizations')
  })

  it('treats undefined and the matching default as the same key', () => {
    expect(getOrganizationsCacheKey(instance)).toBe(
      getOrganizationsCacheKey(instance, {
        includeMembers: false,
        includeFeatures: false,
        includeImplicitMemberships: false,
      }),
    )
  })

  it('explicit includeMembers: true appends :members', () => {
    expect(getOrganizationsCacheKey(instance, {includeMembers: true})).toBe('organizations:members')
  })

  it('explicit includeFeatures: true appends :features', () => {
    expect(getOrganizationsCacheKey(instance, {includeFeatures: true})).toBe(
      'organizations:features',
    )
  })

  it('explicit includeImplicitMemberships: true appends :implicit', () => {
    expect(getOrganizationsCacheKey(instance, {includeImplicitMemberships: true})).toBe(
      'organizations:implicit',
    )
  })

  it('combines all segments in order', () => {
    expect(
      getOrganizationsCacheKey(instance, {
        includeMembers: true,
        includeFeatures: true,
        includeImplicitMemberships: true,
      }),
    ).toBe('organizations:members:features:implicit')
  })

  it('produces distinct keys for each meaningful option permutation', () => {
    const keys = new Set([
      getOrganizationsCacheKey(instance),
      getOrganizationsCacheKey(instance, {includeMembers: true}),
      getOrganizationsCacheKey(instance, {includeFeatures: true}),
      getOrganizationsCacheKey(instance, {includeImplicitMemberships: true}),
      getOrganizationsCacheKey(instance, {includeMembers: true, includeFeatures: true}),
      getOrganizationsCacheKey(instance, {
        includeMembers: true,
        includeImplicitMemberships: true,
      }),
      getOrganizationsCacheKey(instance, {
        includeFeatures: true,
        includeImplicitMemberships: true,
      }),
      getOrganizationsCacheKey(instance, {
        includeMembers: true,
        includeFeatures: true,
        includeImplicitMemberships: true,
      }),
    ])
    expect(keys.size).toBe(8)
  })
})
