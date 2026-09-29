import {FETCH_TIMEOUT_DEFAULT} from '@sanity/comlink'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {
  installMessageBus,
  type MessageBusHost,
  type MessageBusMessage,
  resetMessageBus,
} from '../dashboard/messageBus/bus'
import {type FavoriteDocument, type PayloadOf} from '../dashboard/messageBus/topics'
import {createSanityInstance, type SanityInstance} from '../store/createSanityInstance'
import {getBusFavoriteState, resolveBusFavorite, setBusFavorite} from './busFavorites'
import {type FavoriteDocumentContext} from './favorites'

const MESSAGE_BUS_KEY = Symbol.for('sanity.os.bus')

let host: MessageBusHost
let instance: SanityInstance

beforeEach(() => {
  vi.stubGlobal('__SANITY_APP_ID__', 'app')
  host = installMessageBus({appId: 'dashboard'})
  instance = createSanityInstance({projectId: 'p', dataset: 'd'})
})

afterEach(() => {
  instance.dispose()
  resetMessageBus()
  delete (globalThis as {[MESSAGE_BUS_KEY]?: unknown})[MESSAGE_BUS_KEY]
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

const context: FavoriteDocumentContext = {
  documentId: 'doc',
  documentType: 'movie',
  resourceId: 'p.d',
  resourceType: 'studio',
}

describe('getBusFavoriteState', () => {
  // Studios travel as their dataset resource.
  const favorite: FavoriteDocument = {
    id: 'doc',
    type: 'movie',
    resource: {id: 'p.d', type: 'dataset'},
  }

  const provideFavorites = (provided: boolean) =>
    host.connections.subscribe((client) =>
      client.emit('applications.capabilities', provided ? {favorites: true} : {}),
    )
  const publish = (documents: FavoriteDocument[]) =>
    host.connections.subscribe((client) => client.emit('favorites.documents', documents))
  const read = (overrides: Partial<FavoriteDocumentContext> = {}) =>
    getBusFavoriteState(instance, {...context, ...overrides}).getCurrent()

  it('is pending until the host publishes its capabilities and favorites', () => {
    expect(read()).toBeUndefined()

    provideFavorites(true)
    expect(read()).toBeUndefined()

    publish([favorite])
    expect(read()).toBe(true)
  })

  it('is not favorited without waiting when the host does not provide favorites', () => {
    provideFavorites(false)
    expect(read()).toBe(false)
  })

  it('notifies subscribers when the host republishes favorites or withdraws the capability', () => {
    provideFavorites(true)
    publish([favorite])
    const onChange = vi.fn()
    getBusFavoriteState(instance, context).subscribe(onChange)

    publish([])
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(read()).toBe(false)

    publish([favorite])
    provideFavorites(false)
    expect(onChange).toHaveBeenCalledTimes(3)
    expect(read()).toBe(false)
  })

  it('emits the status on its observable', () => {
    const values: (boolean | undefined)[] = []
    const subscription = getBusFavoriteState(instance, context).observable.subscribe((value) =>
      values.push(value),
    )

    provideFavorites(true)
    publish([favorite])
    subscription.unsubscribe()

    expect(values).toEqual([undefined, true])
  })

  describe('matching', () => {
    beforeEach(() => provideFavorites(true))

    it.each<Partial<FavoriteDocumentContext>>([
      {documentId: 'other'},
      {documentType: 'author'},
      {resourceId: 'other.dataset'},
      {resourceType: 'media-library'},
      {schemaName: 'other'},
    ])('does not match a favorite that differs in %o', (difference) => {
      publish([favorite])
      expect(read(difference)).toBe(false)
    })

    it('matches a favorite stored under the same schemaName', () => {
      publish([{...favorite, resource: {...favorite.resource, schemaName: 'production'}}])
      expect(read({schemaName: 'production'})).toBe(true)
    })

    it.each([
      {stored: 'doc', read: 'drafts.doc'},
      {stored: 'doc', read: 'versions.rABC.doc'},
      {stored: 'drafts.doc', read: 'doc'},
    ])('matches a favorite stored as $stored when read as $read', ({stored, read: documentId}) => {
      publish([{...favorite, id: stored}])
      expect(read({documentId})).toBe(true)
    })

    it('degrades a malformed favorite ID to not favorited instead of throwing', () => {
      publish([{...favorite, id: 'not a document id'}])
      expect(read()).toBe(false)
    })
  })

  it('resolves on the capabilities first, so a host without favorites is not waited on', async () => {
    const pending = resolveBusFavorite(instance)

    provideFavorites(false)

    await expect(pending).resolves.toBeUndefined()
    expect(read()).toBe(false)
  })

  it('is not favorited when the host refuses favorites.documents', async () => {
    provideFavorites(true)
    host.connections.subscribe((client) => client.reject('favorites.documents', 'hidden'))

    await resolveBusFavorite(instance)

    expect(read()).toBe(false)
  })
})

describe('setBusFavorite', () => {
  // Holds the update so a test decides when the host replies.
  const captureUpdates = () => {
    const updates: MessageBusMessage<PayloadOf<'favorites.update'>, void>[] = []
    host.subscribe('favorites.update', (message) => void updates.push(message))
    return updates
  }

  it.each([
    {
      input: {...context, schemaName: 'production', isFavorited: true},
      resource: {id: 'p.d', type: 'dataset', schemaName: 'production'},
    },
    {
      input: {
        ...context,
        resourceId: 'library',
        resourceType: 'media-library' as const,
        isFavorited: false,
      },
      resource: {id: 'library', type: 'media-library'},
    },
  ])(
    'emits favorites.update for $resource.type and resolves on the reply',
    async ({input, resource}) => {
      const updates = captureUpdates()

      const pending = setBusFavorite(instance, input)

      expect(updates.map((message) => message.payload)).toStrictEqual([
        {document: {id: 'doc', type: 'movie', resource}, favorited: input.isFavorited},
      ])
      updates[0].reply()
      await expect(pending).resolves.toMatchObject({data: {isFavorited: input.isFavorited}})
    },
  )

  it('rejects right away when no host answers favorites.update', async () => {
    await expect(setBusFavorite(instance, {...context, isFavorited: true})).rejects.toMatchObject({
      code: 'NO_RESPONDER',
    })
  })

  it('rejects when the host refuses the update', async () => {
    host.subscribe('favorites.update', (message) => message.reject('no favorites'))

    await expect(setBusFavorite(instance, {...context, isFavorited: true})).rejects.toThrow(
      'no favorites',
    )
  })

  it('waits as long as the comlink write before timing out', async () => {
    vi.useFakeTimers()
    // A host that accepts the update but never replies.
    captureUpdates()

    const settled = vi.fn()
    const pending = setBusFavorite(instance, {...context, isFavorited: true})
    pending.catch(settled)

    await vi.advanceTimersByTimeAsync(FETCH_TIMEOUT_DEFAULT - 1)
    expect(settled).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    await expect(pending).rejects.toMatchObject({code: 'TIMEOUT'})
  })
})
