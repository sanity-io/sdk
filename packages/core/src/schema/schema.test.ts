import {type SanityClient} from '@sanity/client'
import {of} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'

import {getClientState} from '../client/clientStore'
import {createSanityInstance, type SanityInstance} from '../store/createSanityInstance'
import {type StateSource} from '../store/createStateSourceAction'
import {getSchemaCacheKey, schema} from './schema'

vi.mock('../client/clientStore')

describe('schema', () => {
  let instance: SanityInstance

  beforeEach(() => {
    instance = createSanityInstance({projectId: 'p', dataset: 'd'})
  })

  afterEach(() => {
    instance.dispose()
  })

  const mockRequest = (request: ReturnType<typeof vi.fn>) => {
    const mockClient = {
      observable: {request} as unknown as SanityClient['observable'],
    } as SanityClient

    vi.mocked(getClientState).mockReturnValue({
      observable: of(mockClient),
    } as StateSource<SanityClient>)
  }

  it('calls `client.observable.request` against `/schemas/dataset/<projectId>.<dataset>`', async () => {
    const definition = {_meta: {}, name: 'schema', types: []}
    const request = vi.fn().mockReturnValue(of(definition))
    mockRequest(request)

    const result = await schema.resolveState(instance)
    expect(result).toEqual(definition)
    expect(request).toHaveBeenCalledWith({
      url: '/schemas/dataset/p.d',
      tag: 'schemas.get',
    })
    expect(getClientState).toHaveBeenCalledWith(
      instance,
      expect.objectContaining({apiVersion: 'vX', scope: 'global'}),
    )
  })

  it('reads the schema for an explicit projectId and dataset over the instance config', async () => {
    const request = vi.fn().mockReturnValue(of({_meta: {}, name: 'schema', types: []}))
    mockRequest(request)

    await schema.resolveState(instance, {projectId: 'other', dataset: 'other-dataset'})
    expect(request).toHaveBeenCalledWith({
      url: '/schemas/dataset/other.other-dataset',
      tag: 'schemas.get',
    })
  })

  it('reads the schema for an explicit dataset resource', async () => {
    const request = vi.fn().mockReturnValue(of({_meta: {}, name: 'schema', types: []}))
    mockRequest(request)

    await schema.resolveState(instance, {resource: {projectId: 'p2', dataset: 'd2'}})
    expect(request).toHaveBeenCalledWith({
      url: '/schemas/dataset/p2.d2',
      tag: 'schemas.get',
    })
  })

  it('rejects when no projectId and dataset can be resolved', async () => {
    const bare = createSanityInstance({})
    // async wrapper: the missing-resource error is thrown synchronously from getKey
    await expect(async () => schema.resolveState(bare)).rejects.toThrow(
      'A projectId and dataset are required to use the schema API.',
    )
    bare.dispose()
  })

  it('rejects non-dataset resources', async () => {
    const mediaLibrary = createSanityInstance({resource: {mediaLibraryId: 'ml123'}})
    await expect(async () =>
      schema.resolveState(mediaLibrary, {resource: {mediaLibraryId: 'ml123'}}),
    ).rejects.toThrow('The schema API is only available for dataset resources.')
    mediaLibrary.dispose()
  })

  it('derives distinct cache keys per dataset resource', () => {
    expect(getSchemaCacheKey(instance)).toBe('schema:p.d')
    expect(getSchemaCacheKey(instance, {projectId: 'a', dataset: 'b'})).toBe('schema:a.b')
    expect(getSchemaCacheKey(instance, {resource: {projectId: 'a', dataset: 'b'}})).toBe(
      'schema:a.b',
    )
  })
})
