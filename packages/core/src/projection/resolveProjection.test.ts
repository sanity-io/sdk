import {describe, it, type Mock} from 'vitest'

import {createSanityInstance} from '../instance/sanityInstance'
import {
  createResourceState,
  getOrCreateResource,
  type InitializedResource,
  type ResourceState,
} from '../resources/createResource'
import {insecureRandomId} from '../utils/ids'
import {
  projectionStore,
  type ProjectionStoreState,
  type ProjectionValuePending,
} from './projectionStore'
import {resolveProjection} from './resolveProjection'

vi.mock('../utils/ids', async (importOriginal) => {
  const util = await importOriginal<typeof import('../utils/ids')>()
  return {...util, insecureRandomId: vi.fn(util.insecureRandomId)}
})

vi.mock('../resources/createResource', async (importOriginal) => {
  const original = await importOriginal<typeof import('../resources/createResource')>()
  return {...original, getOrCreateResource: vi.fn()}
})

describe('resolveProjection', () => {
  const instance = createSanityInstance({projectId: 'exampleProject', dataset: 'exampleDataset'})
  const document = {_id: 'exampleId', _type: 'exampleType'}
  const projectionString = 'title, description'
  const initialState: ProjectionStoreState = {
    documentProjections: {},
    lastLiveEventId: null,
    subscriptions: {},
    syncTags: {},
    values: {},
  }
  let state: ResourceState<ProjectionStoreState>

  beforeEach(() => {
    state = createResourceState(initialState)
  })

  it('subscribes and resolves when the projection value is non-null', async () => {
    expect(state.get().subscriptions).toEqual({})
    ;(insecureRandomId as Mock).mockImplementationOnce(() => 'pseudoRandomId')

    const projectionPromise = resolveProjection(
      {state, instance},
      {document, projection: projectionString},
    )
    expect(state.get().subscriptions).toEqual({exampleId: {pseudoRandomId: true}})
    expect(state.get().documentProjections).toEqual({exampleId: projectionString})

    state.set('updateDifferentDocument', (prev) => ({
      values: {
        ...prev.values,
        differentId: {results: {title: 'Different Document'}, isPending: false},
      },
    }))

    expect(state.get().subscriptions).toEqual({exampleId: {pseudoRandomId: true}})

    state.set('updateCorrectDocumentButNull', (prev) => ({
      values: {...prev.values, exampleId: {results: null, isPending: true}},
    }))

    expect(state.get().subscriptions).toEqual({exampleId: {pseudoRandomId: true}})

    state.set('updateCorrectDocument', (prev) => ({
      values: {
        ...prev.values,
        exampleId: {
          results: {title: 'Correct Document', description: 'Test'},
          isPending: false,
        },
      },
    }))

    const projectionResult = await projectionPromise
    expect(projectionResult).toEqual({
      results: {title: 'Correct Document', description: 'Test'},
      isPending: false,
    })

    // subscription is removed after
    expect(state.get().subscriptions).toEqual({})
  })

  it('resolves with the next emitted state (not current state)', async () => {
    const currentValue: ProjectionValuePending<Record<string, unknown>> = {
      results: {title: 'Current Document', description: 'Test'},
      isPending: false,
    }
    state.set('setInitialDocument', (prev) => ({
      values: {...prev.values, exampleId: currentValue},
    }))
    vi.mocked(insecureRandomId).mockImplementationOnce(() => 'pseudoRandomId')
    expect(state.get().subscriptions).toEqual({})

    const projectionPromise = resolveProjection(
      {state, instance},
      {document, projection: projectionString},
    )
    expect(state.get().subscriptions).toEqual({exampleId: {pseudoRandomId: true}})

    state.set('updateDifferentDocument', (prev) => ({
      values: {
        ...prev.values,
        differentId: {results: {title: 'Different Document'}, isPending: false},
      },
    }))
    expect(state.get().subscriptions).toEqual({exampleId: {pseudoRandomId: true}})

    state.set('updateWithCurrentValue', (prev) => ({
      values: {...prev.values, exampleId: currentValue},
    }))
    expect(state.get().subscriptions).toEqual({exampleId: {pseudoRandomId: true}})

    state.set('updateWithNewValue', (prev) => ({
      values: {
        ...prev.values,
        exampleId: {
          results: {title: 'New Value', description: 'Updated'},
          isPending: false,
        },
      },
    }))
    expect(state.get().subscriptions).toEqual({})

    const projectionResult = await projectionPromise
    expect(projectionResult).toEqual({
      results: {title: 'New Value', description: 'Updated'},
      isPending: false,
    })
  })

  it('calls getOrCreateResource if no state is provided', () => {
    vi.mocked(getOrCreateResource).mockReturnValue({state} as InitializedResource<unknown>)
    resolveProjection(instance, {document, projection: projectionString})
    expect(getOrCreateResource).toHaveBeenCalledWith(instance, projectionStore)
  })
})
