import {type SanityClient} from '@sanity/client'
import {firstValueFrom, Observable, Subject} from 'rxjs'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {config} from '../../../test/fixtures'
import {getTokenState} from '../../auth/authStore'
import {createSanityInstance} from '../../instance/sanityInstance'
import type {SanityInstance} from '../../instance/types'
import {getOrCreateResource} from '../../resources/createResource'
import {clientStore} from '../clientStore'
import {getSubscribableClient} from './getSubscribableClient'

vi.mock('../../auth/authStore', async (importOriginal) => {
  const original = importOriginal<typeof import('../../auth/authStore')>()
  return {
    ...original,
    getTokenState: vi.fn().mockReturnValue({
      observable: new Subject<string | null>(),
    }),
  }
})

describe('getSubscribableClient', () => {
  const apiVersion = '2024-12-05'

  let instance: SanityInstance
  let tokenSubject: Subject<string | null>

  beforeEach(() => {
    instance = createSanityInstance(config)

    // @ts-expect-error no params required since mocking
    const tokenState = getTokenState()
    tokenSubject = tokenState.observable as Subject<string | null>

    vi.clearAllMocks()

    // ensure resource is created
    getOrCreateResource(instance, clientStore)
  })

  it('should create subscribable client and emit initial client', () => {
    const client$ = getSubscribableClient(instance, {apiVersion})

    client$.subscribe({
      next: (emittedClient) => {
        expect(emittedClient.config().apiVersion).toBe(apiVersion)
      },
    })
  })

  it('should emit updated client when auth token changes', () => {
    const emittedClients: SanityClient[] = []

    const client$ = getSubscribableClient(instance, {apiVersion})

    // Track emissions
    client$.subscribe({
      next: (client) => {
        emittedClients.push(client)
      },
    })

    tokenSubject.next('new-token')

    // initial client + updated client = 2
    expect(emittedClients.length).toBe(2)
    expect(emittedClients[0].config().token).toBeUndefined()
    expect(emittedClients[1].config().token).toBe('new-token')
  })

  it('should use the same client for same API version', async () => {
    const client1Promise = firstValueFrom(
      new Observable<SanityClient>((observer) =>
        getSubscribableClient(instance, {apiVersion}).subscribe(observer),
      ),
    )
    const client2Promise = firstValueFrom(
      new Observable<SanityClient>((observer) =>
        getSubscribableClient(instance, {apiVersion}).subscribe(observer),
      ),
    )

    const client1 = await client1Promise
    const client2 = await client2Promise

    expect(client1).toBe(client2)
  })
})
