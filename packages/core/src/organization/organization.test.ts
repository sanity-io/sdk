import {type SanityClient} from '@sanity/client'
import {of} from 'rxjs'
import {afterEach, beforeEach, describe, it} from 'vitest'

import {getClientState} from '../client/clientStore'
import {createSanityInstance, type SanityInstance} from '../store/createSanityInstance'
import {type StateSource} from '../store/createStateSourceAction'
import {getOrganizationCacheKey, resolveOrganization} from './organization'

vi.mock('../client/clientStore')

describe('organization', () => {
  let instance: SanityInstance

  beforeEach(() => {
    instance = createSanityInstance({projectId: 'p', dataset: 'd'})
  })

  afterEach(() => {
    instance.dispose()
  })

  it('calls `client.observable.request` against `/organizations/<id>` and returns the result', async () => {
    const organization = {id: 'org_1'}
    const request = vi.fn().mockReturnValue(of(organization))

    const mockClient = {
      observable: {request} as unknown as SanityClient['observable'],
    } as SanityClient

    vi.mocked(getClientState).mockReturnValue({
      observable: of(mockClient),
    } as StateSource<SanityClient>)

    const result = await resolveOrganization(instance, {organizationId: 'org_1'})
    expect(result).toEqual(organization)
    expect(request).toHaveBeenCalledWith({
      uri: '/organizations/org_1',
      query: {includeMembers: 'false', includeFeatures: 'false'},
      tag: 'organization.get',
    })
  })

  it('serializes query params (booleans → strings) and respects flags', async () => {
    const request = vi.fn().mockReturnValue(of({id: 'org_1'}))
    const mockClient = {
      observable: {request} as unknown as SanityClient['observable'],
    } as SanityClient

    vi.mocked(getClientState).mockReturnValue({
      observable: of(mockClient),
    } as StateSource<SanityClient>)

    await resolveOrganization(instance, {
      organizationId: 'org_1',
      includeMembers: true,
      includeFeatures: true,
    })

    expect(request).toHaveBeenCalledWith({
      uri: '/organizations/org_1',
      query: {
        includeMembers: 'true',
        includeFeatures: 'true',
      },
      tag: 'organization.get',
    })
  })

  it('throws when no organizationId is provided', async () => {
    await expect(resolveOrganization(instance, {organizationId: ''} as never)).rejects.toThrow(
      'An organizationId is required to use the organization API.',
    )
  })
})

describe('organization cache key generation', () => {
  let instance: SanityInstance

  beforeEach(() => {
    instance = createSanityInstance({})
  })

  afterEach(() => {
    instance.dispose()
  })

  it('default call excludes :members and :features (both default-false)', () => {
    expect(getOrganizationCacheKey(instance, {organizationId: 'org_1'})).toBe('organization:org_1')
  })

  it('treats undefined and the matching default as the same key', () => {
    expect(getOrganizationCacheKey(instance, {organizationId: 'org_1'})).toBe(
      getOrganizationCacheKey(instance, {
        organizationId: 'org_1',
        includeMembers: false,
        includeFeatures: false,
      }),
    )
  })

  it('explicit includeMembers: true appends :members', () => {
    expect(getOrganizationCacheKey(instance, {organizationId: 'org_1', includeMembers: true})).toBe(
      'organization:org_1:members',
    )
  })

  it('explicit includeFeatures: true appends :features', () => {
    expect(
      getOrganizationCacheKey(instance, {organizationId: 'org_1', includeFeatures: true}),
    ).toBe('organization:org_1:features')
  })

  it('combines all segments in order', () => {
    expect(
      getOrganizationCacheKey(instance, {
        organizationId: 'org_1',
        includeMembers: true,
        includeFeatures: true,
      }),
    ).toBe('organization:org_1:members:features')
  })

  it('produces distinct keys for each meaningful option permutation', () => {
    const keys = new Set([
      getOrganizationCacheKey(instance, {organizationId: 'org_1'}),
      getOrganizationCacheKey(instance, {organizationId: 'org_1', includeMembers: true}),
      getOrganizationCacheKey(instance, {organizationId: 'org_1', includeFeatures: true}),
      getOrganizationCacheKey(instance, {
        organizationId: 'org_1',
        includeMembers: true,
        includeFeatures: true,
      }),
      getOrganizationCacheKey(instance, {organizationId: 'org_2'}),
    ])
    expect(keys.size).toBe(5)
  })
})
