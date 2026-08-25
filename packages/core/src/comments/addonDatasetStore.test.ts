import {type SanityClient} from '@sanity/client'
import {BehaviorSubject, firstValueFrom, NEVER, of, throwError} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {getClient, getClientState} from '../client/clientStore'
import {createSanityInstance, type SanityInstance} from '../store/createSanityInstance'
import {type StateSource} from '../store/createStateSourceAction'
import {
  getAddonDatasetState,
  observeAddonDatasetClient,
  provisionAddonDataset,
} from './addonDatasetStore'

vi.mock('../client/clientStore', () => ({
  getClient: vi.fn(),
  getClientState: vi.fn(),
}))

let instance: SanityInstance
let observableRequest: ReturnType<typeof vi.fn>
let request: ReturnType<typeof vi.fn>

function mockClient() {
  observableRequest = vi.fn()
  request = vi.fn()
  const client = {observable: {request: observableRequest}, request} as unknown as SanityClient

  vi.mocked(getClient).mockReturnValue(client)
  vi.mocked(getClientState).mockReturnValue({
    observable: of(client),
    getCurrent: () => client,
    subscribe: () => () => {},
  } as unknown as StateSource<SanityClient>)

  return client
}

/** Waits for discovery, which runs asynchronously when the store initializes. */
function resolvedAddonDataset() {
  return firstValueFrom(getAddonDatasetState(instance, {}).observable.pipe())
}

beforeEach(() => {
  vi.resetAllMocks()
  instance = createSanityInstance({projectId: 'p', dataset: 'd'})
  mockClient()
})

afterEach(() => {
  instance.dispose()
})

describe('getAddonDatasetState', () => {
  it('reports the dataset name once discovery answers', async () => {
    observableRequest.mockReturnValue(of([{name: 'd-comments'}]))

    await vi.waitFor(() =>
      expect(getAddonDatasetState(instance, {}).getCurrent()).toBe('d-comments'),
    )

    expect(observableRequest).toHaveBeenCalledWith({
      uri: '/projects/p/datasets?datasetProfile=comments&addonFor=d',
      tag: 'comments.addon-dataset.list',
    })
  })

  it('reports null when the project has no comments dataset', async () => {
    observableRequest.mockReturnValue(of([]))

    await vi.waitFor(() => expect(getAddonDatasetState(instance, {}).getCurrent()).toBe(null))
  })

  it('reports null rather than erroring when discovery is forbidden', async () => {
    // A member without access to the addon dataset gets a 403. There is nothing
    // for them to read, which is the same outcome as the dataset not existing.
    observableRequest.mockReturnValue(throwError(() => ({statusCode: 403})))

    await vi.waitFor(() => expect(getAddonDatasetState(instance, {}).getCurrent()).toBe(null))
  })

  it('recovers when a new authenticated client arrives after a transient failure', async () => {
    const firstClient = {
      observable: {request: vi.fn(() => throwError(() => ({statusCode: 500})))},
    } as unknown as SanityClient
    const secondClient = {
      observable: {request: vi.fn(() => of([{name: 'd-comments'}]))},
    } as unknown as SanityClient
    const clients = new BehaviorSubject(firstClient)

    vi.mocked(getClientState).mockReturnValue({
      observable: clients,
      getCurrent: () => clients.getValue(),
      subscribe: () => () => {},
    } as unknown as StateSource<SanityClient>)

    const state = getAddonDatasetState(instance, {})
    expect(state.getCurrent()).toBe(undefined)

    clients.next(secondClient)

    await vi.waitFor(() => expect(state.getCurrent()).toBe('d-comments'))
  })

  it('stays undefined while discovery is in flight', () => {
    observableRequest.mockReturnValue(NEVER)
    expect(getAddonDatasetState(instance, {}).getCurrent()).toBe(undefined)
  })

  it('throws for a resource that is not a dataset', () => {
    expect(() => getAddonDatasetState(instance, {resource: {mediaLibraryId: 'ml-1'}})).toThrow(
      /only supported for dataset resources/,
    )
  })
})

describe('provisionAddonDataset', () => {
  it('returns the existing dataset without writing anything', async () => {
    observableRequest.mockReturnValue(of([{name: 'd-comments'}]))
    await resolvedAddonDataset()

    await expect(provisionAddonDataset(instance, {})).resolves.toBe('d-comments')
    expect(request).not.toHaveBeenCalled()
  })

  it('re-checks before creating, and adopts a dataset another user just made', async () => {
    // Discovery said missing when this client started, but someone else has
    // provisioned it since. Creating it again would fail.
    observableRequest.mockReturnValueOnce(of([])).mockReturnValueOnce(of([{name: 'd-comments'}]))
    await resolvedAddonDataset()

    await expect(provisionAddonDataset(instance, {})).resolves.toBe('d-comments')
    expect(request).not.toHaveBeenCalled()
  })

  it('creates the dataset when the re-check confirms it is missing', async () => {
    observableRequest.mockReturnValue(of([]))
    request.mockResolvedValue({datasetName: 'd-comments'})
    await resolvedAddonDataset()

    await expect(provisionAddonDataset(instance, {})).resolves.toBe('d-comments')
    expect(request).toHaveBeenCalledWith({
      uri: '/comments/d/setup',
      method: 'POST',
      tag: 'comments.addon-dataset.setup',
    })
    expect(getAddonDatasetState(instance, {}).getCurrent()).toBe('d-comments')
  })

  it('issues one POST for concurrent callers', async () => {
    observableRequest.mockReturnValue(of([]))
    request.mockResolvedValue({datasetName: 'd-comments'})
    await resolvedAddonDataset()

    const results = await Promise.all([
      provisionAddonDataset(instance, {}),
      provisionAddonDataset(instance, {}),
      provisionAddonDataset(instance, {}),
    ])

    expect(results).toEqual(['d-comments', 'd-comments', 'd-comments'])
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('throws when setup returns no dataset name', async () => {
    observableRequest.mockReturnValue(of([]))
    request.mockResolvedValue({})
    await resolvedAddonDataset()

    await expect(provisionAddonDataset(instance, {})).rejects.toThrow(/no dataset name/)
  })

  it('allows a retry after a failure', async () => {
    observableRequest.mockReturnValue(of([]))
    request.mockRejectedValueOnce(new Error('boom')).mockResolvedValue({datasetName: 'd-comments'})
    await resolvedAddonDataset()

    await expect(provisionAddonDataset(instance, {})).rejects.toThrow('boom')
    await expect(provisionAddonDataset(instance, {})).resolves.toBe('d-comments')
  })
})

describe('observeAddonDatasetClient', () => {
  it('does not report a missing dataset while discovery is still in flight', () => {
    observableRequest.mockReturnValue(NEVER)
    const values: Array<SanityClient | null> = []

    const subscription = observeAddonDatasetClient(instance, {}).subscribe((value) =>
      values.push(value),
    )

    expect(values).toEqual([])
    subscription.unsubscribe()
  })

  it('emits null while the project has no comments dataset', async () => {
    observableRequest.mockReturnValue(of([]))

    await expect(firstValueFrom(observeAddonDatasetClient(instance, {}))).resolves.toBe(null)
  })

  it('emits a client once the dataset is known', async () => {
    const client = mockClient()
    observableRequest.mockReturnValue(of([{name: 'd-comments'}]))

    await vi.waitFor(async () =>
      expect(await firstValueFrom(observeAddonDatasetClient(instance, {}))).toBe(client),
    )

    expect(getClientState).toHaveBeenCalledWith(instance, {
      apiVersion: 'v2025-05-06',
      projectId: 'p',
      dataset: 'd-comments',
    })
  })
})
