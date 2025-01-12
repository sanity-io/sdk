import {omit} from 'lodash-es'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {createSanityInstance} from '../instance/sanityInstance'
import {createResourceState, type ResourceState} from '../resources/createResource'
import {documentStore, type DocumentStoreState} from './documentStore'
import {getDocumentState} from './getDocumentState'

describe('getDocumentState', () => {
  const documentId = 'exampleId'
  const instance = createSanityInstance({projectId: 'exampleProject', dataset: 'exampleDataset'})
  const initialState = documentStore.getInitialState(instance)
  let state: ResourceState<DocumentStoreState>

  beforeEach(() => {
    state = createResourceState(initialState)
  })

  it('returns a state source that emits when the document value changes', () => {
    const documentState = getDocumentState({state, instance}, documentId)
    expect(documentState.getCurrent()).toBe(undefined)

    const subscriber = vi.fn()

    documentState.subscribe(subscriber)

    const exampleDocument = {
      _id: documentId,
      _type: 'exampleType',
      _createdAt: new Date().toISOString(),
    }

    state.set('updateDocument', (prev) => ({
      documents: {
        ...prev.documents,
        exampleId: exampleDocument,
      },
    }))
    expect(subscriber).toHaveBeenCalledTimes(1)
    expect(documentState.getCurrent()).toBe(exampleDocument)

    state.set('unrelatedDocumentChange', (prev) => ({
      documents: {
        ...prev.documents,
        unrelatedDoc: {_id: 'unrelatedDoc', _type: 'exampleType'},
      },
    }))
    expect(subscriber).toHaveBeenCalledTimes(1)
    expect(documentState.getCurrent()).toBe(exampleDocument)

    state.set('updateDocument', (prev) => ({
      documents: omit(prev.documents, exampleDocument._id),
    }))
    expect(subscriber).toHaveBeenCalledTimes(2)
    expect(documentState.getCurrent()).toBe(undefined)
  })

  it('allows a selector', () => {
    const nameState = getDocumentState(
      {state, instance},
      documentId,
      (doc) => doc?.['name'] as string | undefined,
    )

    const exampleDocument = {
      _id: documentId,
      _type: 'exampleType',
      _updatedAt: new Date().toISOString(),
      name: 'original',
    }

    state.set('updateDocument', (prev) => ({
      documents: {
        ...prev.documents,
        exampleId: exampleDocument,
      },
    }))

    const subscriber = vi.fn()
    nameState.subscribe(subscriber)
    expect(nameState.getCurrent()).toBe('original')

    const nextDocument = {
      ...exampleDocument,
      name: 'updated',
    }

    state.set('updateDocument', (prev) => ({
      documents: {
        ...prev.documents,
        exampleId: nextDocument,
      },
    }))

    expect(nameState.getCurrent()).toBe('updated')
    expect(subscriber).toHaveBeenCalledTimes(1)

    state.set('unrelatedUpdate', (prev) => ({
      documents: {
        ...prev.documents,
        exampleId: {
          ...nextDocument,
          _updatedAt: new Date().toISOString(),
        },
      },
    }))

    expect(nameState.getCurrent()).toBe('updated')
    expect(subscriber).toHaveBeenCalledTimes(1)
  })

  it('throws the current error, if set', () => {
    state.set('setError', {error: new Error('test error')})
    const documentState = getDocumentState({state, instance}, 'exampleId')

    expect(() => documentState.getCurrent()).toThrowError('test error')
  })

  it('adds and removes a subscription ID based on the subscription lifecycle', () => {
    const documentState = getDocumentState({instance, state}, 'exampleId')

    expect(state.get().subscriptions).toEqual({})

    const unsubscribe1 = documentState.subscribe(vi.fn())
    expect(state.get().subscriptions[documentId]).toHaveLength(1)

    const unsubscribe2 = documentState.subscribe(vi.fn())
    expect(state.get().subscriptions[documentId]).toHaveLength(2)

    unsubscribe1()
    expect(state.get().subscriptions[documentId]).toHaveLength(1)

    unsubscribe2()
    expect(state.get().subscriptions).not.toHaveProperty(documentId)
  })
})
