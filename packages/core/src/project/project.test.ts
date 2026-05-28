import {type SanityClient} from '@sanity/client'
import {of} from 'rxjs'
import {afterEach, beforeEach, describe, it} from 'vitest'

import {getClientState} from '../client/clientStore'
import {createSanityInstance, type SanityInstance} from '../store/createSanityInstance'
import {type StateSource} from '../store/createStateSourceAction'
import {getProjectCacheKey, resolveProject} from './project'

vi.mock('../client/clientStore')

describe('project', () => {
  let instance: SanityInstance

  beforeEach(() => {
    instance = createSanityInstance({projectId: 'p', dataset: 'd'})
  })

  afterEach(() => {
    instance.dispose()
  })

  it('calls `client.observable.request` against `/projects/<id>` and returns the result', async () => {
    const project = {id: 'a'}
    const request = vi.fn().mockReturnValue(of(project))

    const mockClient = {
      observable: {request} as unknown as SanityClient['observable'],
    } as SanityClient

    vi.mocked(getClientState).mockReturnValue({
      observable: of(mockClient),
    } as StateSource<SanityClient>)

    const result = await resolveProject(instance, {projectId: 'a'})
    expect(result).toEqual(project)
    expect(request).toHaveBeenCalledWith({
      uri: '/projects/a',
      query: {includeMembers: 'true', includeFeatures: 'true'},
      tag: 'project.get',
    })
  })

  it('serializes query params (booleans → strings) and respects flags', async () => {
    const request = vi.fn().mockReturnValue(of({id: 'a'}))
    const mockClient = {
      observable: {request} as unknown as SanityClient['observable'],
    } as SanityClient

    vi.mocked(getClientState).mockReturnValue({
      observable: of(mockClient),
    } as StateSource<SanityClient>)

    await resolveProject(instance, {
      projectId: 'a',
      includeMembers: false,
      includeFeatures: false,
    })

    expect(request).toHaveBeenCalledWith({
      uri: '/projects/a',
      query: {
        includeMembers: 'false',
        includeFeatures: 'false',
      },
      tag: 'project.get',
    })
  })

  it('falls back to the instance projectId when none is provided in options', async () => {
    const request = vi.fn().mockReturnValue(of({id: 'p'}))
    const mockClient = {
      observable: {request} as unknown as SanityClient['observable'],
    } as SanityClient

    vi.mocked(getClientState).mockReturnValue({
      observable: of(mockClient),
    } as StateSource<SanityClient>)

    await resolveProject(instance)
    expect(request).toHaveBeenCalledWith({
      uri: '/projects/p',
      query: {includeMembers: 'true', includeFeatures: 'true'},
      tag: 'project.get',
    })
  })
})

describe('project cache key generation', () => {
  const mockInstance = {config: {projectId: 'p'}} as SanityInstance

  it('default call includes :members and :features (both default-true)', () => {
    expect(getProjectCacheKey(mockInstance)).toBe('project:p:members:features')
  })

  it('treats undefined and the matching default as the same key', () => {
    expect(getProjectCacheKey(mockInstance)).toBe(
      getProjectCacheKey(mockInstance, {includeMembers: true, includeFeatures: true}),
    )
  })

  it('explicit includeFeatures: false drops the :features segment', () => {
    expect(getProjectCacheKey(mockInstance, {includeFeatures: false})).toBe('project:p:members')
  })

  it('explicit includeMembers: false drops the :members segment', () => {
    expect(getProjectCacheKey(mockInstance, {includeMembers: false})).toBe('project:p:features')
  })

  it('combines all segments in order', () => {
    expect(
      getProjectCacheKey(mockInstance, {
        projectId: 'a',
        includeMembers: true,
        includeFeatures: true,
      }),
    ).toBe('project:a:members:features')
  })

  it('produces distinct keys for each meaningful option permutation', () => {
    const keys = new Set([
      getProjectCacheKey(mockInstance),
      getProjectCacheKey(mockInstance, {includeMembers: false}),
      getProjectCacheKey(mockInstance, {includeFeatures: false}),
      getProjectCacheKey(mockInstance, {includeMembers: false, includeFeatures: false}),
      getProjectCacheKey(mockInstance, {projectId: 'a'}),
      getProjectCacheKey(mockInstance, {projectId: 'b'}),
    ])
    expect(keys.size).toBe(6)
  })
})
