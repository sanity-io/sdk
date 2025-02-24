import {type DatasetsResponse} from '@sanity/client'
import {type Observable, type Operator} from 'rxjs'
import {beforeEach, describe, expect, it, type Mock, vi} from 'vitest'

import {getClient} from '../../client/actions/getClient'
import {type SanityInstance} from '../../instance/types'
import {type ActionContext} from '../../resources/createAction'
import {type ResourceState} from '../../resources/createResource'
import {type DatasetsStoreState} from '../datasetsStore'
import {getDatasets} from './getDatasets'

vi.mock('../../client/actions/getClient', () => ({
  getClient: vi.fn(),
}))

function createMockResourceState(initial: DatasetsStoreState): ResourceState<DatasetsStoreState> {
  let store = structuredClone(initial)
  return {
    get: () => store,
    set: (
      _actionName: string,
      stateOrUpdater:
        | Partial<DatasetsStoreState>
        | ((s: DatasetsStoreState) => Partial<DatasetsStoreState>),
    ) => {
      const payload = typeof stateOrUpdater === 'function' ? stateOrUpdater(store) : stateOrUpdater
      store = {...store, ...payload}
      if (payload.datasets) {
        store.datasets = payload.datasets
      }
      if (payload.isPending) {
        store.isPending = payload.isPending
      }
    },
    observable: {
      subscribe: vi.fn(),
      source: undefined,
      operator: undefined,
      lift: function <R>(_operator?: Operator<DatasetsStoreState, R>): Observable<R> {
        throw new Error('Function not implemented.')
      },
      forEach: function (_next: (value: DatasetsStoreState) => void): Promise<void> {
        throw new Error('Function not implemented.')
      },
      pipe: function (): Observable<DatasetsStoreState> {
        throw new Error('Function not implemented.')
      },
      toPromise: function (): Promise<DatasetsStoreState | undefined> {
        throw new Error('Function not implemented.')
      },
    },
  }
}

describe('getDatasets', () => {
  let mockState: ResourceState<DatasetsStoreState>
  let actionContext: ActionContext<DatasetsStoreState>

  beforeEach(() => {
    vi.resetAllMocks()

    mockState = createMockResourceState({
      datasets: [],
      isPending: false,
      error: null,
      initialLoadComplete: false,
    })

    actionContext = {
      instance: {config: {token: 'fake-token'}} as unknown as SanityInstance,
      state: mockState,
    }

    // Mock default client response
    ;(getClient as Mock).mockImplementation(() => ({
      datasets: {
        list: vi.fn(
          async () =>
            [
              {
                name: 'Dataset 1',
                aclMode: 'public',
                createdAt: '',
                createdByUserId: '',
                addonFor: null,
                datasetProfile: 'content',
                features: [],
                tags: [],
              },
              {
                name: 'Dataset 2',
                aclMode: 'public',
                createdAt: '',
                createdByUserId: '',
                addonFor: null,
                datasetProfile: 'content',
                features: [],
                tags: [],
              },
            ] as DatasetsResponse,
        ),
      },
    }))
  })

  it('returns cached datasets if they exist and are not pending', async () => {
    const existingDatasets: DatasetsResponse = [
      {
        name: 'Existing Dataset 1',
        aclMode: 'public',
        createdAt: '',
        createdByUserId: '',
        addonFor: null,
        datasetProfile: 'content',
        features: [],
        tags: [],
      },
    ]

    mockState.set('', {
      datasets: existingDatasets,
      isPending: false,
      error: null,
      initialLoadComplete: true,
    })

    const result = await getDatasets(actionContext)
    expect(result).toEqual(existingDatasets)
    expect(getClient).not.toHaveBeenCalled()
  })

  it('returns current datasets list if already loaded', async () => {
    const loadingDatasets: DatasetsResponse = [
      {
        name: 'Loading Dataset 1',
        aclMode: 'public',
        createdAt: '',
        createdByUserId: '',
        addonFor: null,
        datasetProfile: 'content',
        features: [],
        tags: [],
      },
    ]
    mockState.set('', {
      datasets: loadingDatasets,
      isPending: false,
      error: null,
      initialLoadComplete: true,
    })

    const result = await getDatasets(actionContext)
    expect(result).toEqual(loadingDatasets)
    expect(getClient).not.toHaveBeenCalled()
  })

  it('fetches datasets if none exist in store', async () => {
    const result = await getDatasets(actionContext)

    expect(getClient).toHaveBeenCalled()
    expect(result).toEqual([
      {
        name: 'Dataset 1',
        aclMode: 'public',
        createdAt: '',
        createdByUserId: '',
        addonFor: null,
        datasetProfile: 'content',
        features: [],
        tags: [],
      },
      {
        name: 'Dataset 2',
        aclMode: 'public',
        createdAt: '',
        createdByUserId: '',
        addonFor: null,
        datasetProfile: 'content',
        features: [],
        tags: [],
      },
    ])

    const currentState = mockState.get()
    expect(currentState.datasets).toMatchObject([
      {
        name: 'Dataset 1',
        aclMode: 'public',
        createdAt: '',
        createdByUserId: '',
        addonFor: null,
        datasetProfile: 'content',
        features: [],
        tags: [],
      },
      {
        name: 'Dataset 2',
        aclMode: 'public',
        createdAt: '',
        createdByUserId: '',
        addonFor: null,
        datasetProfile: 'content',
        features: [],
        tags: [],
      },
    ])
    expect(currentState.isPending).toBe(false)
    expect(currentState.initialLoadComplete).toBe(true)
  })

  it('forces refetch if forceRefetch = true', async () => {
    const existingDatasets: DatasetsResponse = [
      {
        name: 'Old Dataset',
        aclMode: 'public',
        createdAt: '',
        createdByUserId: '',
        addonFor: null,
        datasetProfile: 'content',
        features: [],
        tags: [],
      },
    ]
    mockState.set('', {
      datasets: existingDatasets,
      isPending: false,
      error: null,
      initialLoadComplete: true,
    })

    const result = await getDatasets(actionContext, true)

    expect(getClient).toHaveBeenCalled()
    expect(result).toEqual([
      {
        name: 'Dataset 1',
        aclMode: 'public',
        createdAt: '',
        createdByUserId: '',
        addonFor: null,
        datasetProfile: 'content',
        features: [],
        tags: [],
      },
      {
        name: 'Dataset 2',
        aclMode: 'public',
        createdAt: '',
        createdByUserId: '',
        addonFor: null,
        datasetProfile: 'content',
        features: [],
        tags: [],
      },
    ])
  })

  it('handles errors and sets error state', async () => {
    ;(getClient as Mock).mockImplementation(() => ({
      datasets: {
        list: vi.fn(async () => {
          throw new Error('Fetch failed')
        }),
      },
    }))

    await expect(getDatasets(actionContext)).rejects.toThrow('Fetch failed')

    const stateAfterError = mockState.get()
    expect(stateAfterError).toMatchObject({
      isPending: false,
      error: new Error('Fetch failed'),
      initialLoadComplete: false,
    })
  })
})
