import {first, firstValueFrom, map, ReplaySubject} from 'rxjs'
import {describe, expect, it} from 'vitest'

import {getTokenState} from '../auth/authStore'
import {createSanityInstance} from '../instance/sanityInstance'
import {type SanityInstance} from '../instance/types'
import {type StateSource} from '../resources/createStateSourceAction'
import {type ClientOptions, getClient, getClientState} from './clientStore'

let token$: ReplaySubject<string>
let instance: SanityInstance

vi.mock('../auth/authStore', () => {
  const subject = new ReplaySubject(1)
  subject.next('initial-token')

  return {
    getTokenState: vi.fn().mockReturnValue({observable: subject}),
  }
})

beforeEach(() => {
  instance = createSanityInstance({projectId: 'p', dataset: 'd'})
  token$ = (getTokenState as () => StateSource<string>)().observable as ReplaySubject<string>
})

describe('getClient', () => {
  it('memoizes the resulting client based on current default client', () => {
    const client1 = getClient(instance, {apiVersion: 'vX'})
    const client2 = getClient(instance, {apiVersion: 'vX'})
    expect(client1).toBe(client2)
  })

  it('returns a different result if the token is updated', () => {
    const client1 = getClient(instance, {apiVersion: 'vX'})
    const client2 = getClient(instance, {apiVersion: 'vX'})
    expect(client1).toBe(client2)
    expect(client1.config().token).toBe('initial-token')
    expect(client1.config().token).toBe(client2.config().token)

    token$.next('updated-token')
    const client3 = getClient(instance, {apiVersion: 'vX'})
    const client4 = getClient(instance, {apiVersion: 'vX'})
    expect(client3).toBe(client4)
    expect(client3.config().token).toBe('updated-token')
    expect(client3.config().token).toBe(client4.config().token)
  })
})

describe('getClientState', () => {
  it('returns a state source that updates when `getClient` updates', async () => {
    const options: ClientOptions = {apiVersion: 'vX', scope: 'global'}
    const clientState = getClientState(instance, options)

    expect(clientState.getCurrent()).toBe(getClient(instance, options))

    const subscriber = vi.fn()
    const unsubscribe = clientState.subscribe(subscriber)

    const tokenUpdated = firstValueFrom(
      clientState.observable.pipe(
        map((client) => client.config().token),
        first((token) => token === 'updated-token'),
      ),
    )

    token$.next('updated-token')
    await tokenUpdated

    expect(subscriber).toHaveBeenCalledTimes(1)
    unsubscribe()
  })
})
