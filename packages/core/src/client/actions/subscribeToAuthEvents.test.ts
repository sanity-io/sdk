import {Subject} from 'rxjs'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {config} from '../../../test/fixtures'
import {getTokenState} from '../../auth/authStore'
import {createSanityInstance} from '../../instance/sanityInstance'
import {type SanityInstance} from '../../instance/types'
import {getOrCreateResource} from '../../resources/createResource'
import {clientStore} from '../clientStore'
import {getClient} from './getClient'

vi.mock('../../auth/authStore', async (importOriginal) => {
  const original = importOriginal<typeof import('../../auth/authStore')>()
  return {
    ...original,
    getTokenState: vi.fn().mockReturnValue({
      observable: new Subject<string | null>(),
    }),
  }
})

describe('subscribeToAuthEvents', () => {
  const apiVersion = '2024-01-01'
  const apiVersion2 = '2024-02-01'

  let instance: SanityInstance
  let tokenSubject: Subject<string | null>

  beforeEach(() => {
    instance = createSanityInstance(config)

    // @ts-expect-error no params required since mocking
    const tokenState = getTokenState()
    tokenSubject = tokenState.observable as Subject<string | null>

    vi.clearAllMocks()

    // ensure state is initialized for this resource
    getOrCreateResource(instance, clientStore)
  })

  it('updates all clients in the store when token changes', () => {
    const client1 = getClient(instance, {apiVersion})
    const client2 = getClient(instance, {apiVersion: apiVersion2})

    expect(client1.config().token).toBeUndefined()
    expect(client2.config().token).toBeUndefined()

    tokenSubject.next('new-token')

    // Verify all clients were updated
    const updatedClient1 = getClient(instance, {apiVersion})
    const updatedClient2 = getClient(instance, {apiVersion: apiVersion2})

    expect(updatedClient1.config().token).toBe('new-token')
    expect(updatedClient2.config().token).toBe('new-token')
  })

  it('clears the token when token is null', async () => {
    tokenSubject.next('old-token')

    // Verify all clients were updated
    const client1 = getClient(instance, {apiVersion})
    const client2 = getClient(instance, {apiVersion: apiVersion2})

    expect(client1.config().token).toBe('old-token')
    expect(client2.config().token).toBe('old-token')

    tokenSubject.next(null)

    // Verify all clients were updated
    const clearedClient1 = getClient(instance, {apiVersion})
    const clearedClient2 = getClient(instance, {apiVersion: apiVersion2})

    expect(clearedClient1.config().token).toBeUndefined()
    expect(clearedClient2.config().token).toBeUndefined()
  })
})
