import {Observable, Subject} from 'rxjs'
import {beforeEach, describe, it} from 'vitest'

import {createSanityInstance, type SanityInstance} from '../store/createSanityInstance'
import {createStoreState} from '../store/createStoreState'
import {AuthStateType} from './authStateType'
import {authStore} from './authStore'
import {subscribeToStorageEventsAndSetToken} from './subscribeToStorageEventsAndSetToken'
import {getStorageEvents, getTokenFromStorage} from './utils'

vi.mock('./utils', async (importOriginal) => {
  const original = await importOriginal<typeof import('./utils')>()

  return {...original, getStorageEvents: vi.fn(), getTokenFromStorage: vi.fn()}
})

describe('subscribeToStorageEventsAndSetToken', () => {
  let instance: SanityInstance
  const storageEventSubject = new Subject<{storageArea: Storage; key: string}>()
  const storageArea = {} as Storage

  beforeEach(() => {
    vi.clearAllMocks()

    instance = createSanityInstance({
      projectId: 'p',
      dataset: 'd',
      auth: {storageArea: storageArea},
    })

    vi.mocked(getStorageEvents).mockReturnValue(
      storageEventSubject as unknown as Observable<StorageEvent>,
    )
  })

  it('sets the state to logged in when a matching storage event returns a token', () => {
    const state = createStoreState(authStore.getInitialState(instance))
    const {storageKey} = state.get().options
    const subscription = subscribeToStorageEventsAndSetToken({state, instance})

    expect(state.get()).toMatchObject({
      authState: {type: AuthStateType.LOGGED_OUT, isDestroyingSession: false},
    })

    vi.mocked(getTokenFromStorage).mockReturnValue('new-token')
    storageEventSubject.next({storageArea, key: storageKey})

    expect(state.get()).toMatchObject({
      authState: {type: AuthStateType.LOGGED_IN},
    })

    subscription.unsubscribe()
  })

  it('sets the state to logged in when a matching storage event returns null', () => {
    vi.mocked(getTokenFromStorage).mockReturnValue('existing-token')
    const state = createStoreState(authStore.getInitialState(instance))
    const {storageKey} = state.get().options

    const subscription = subscribeToStorageEventsAndSetToken({state, instance})

    expect(state.get()).toMatchObject({
      authState: {type: AuthStateType.LOGGED_IN, token: 'existing-token', currentUser: null},
    })

    vi.mocked(getTokenFromStorage).mockReturnValue(null)
    storageEventSubject.next({storageArea, key: storageKey})

    expect(state.get()).toMatchObject({
      authState: {type: AuthStateType.LOGGED_OUT, isDestroyingSession: false},
    })

    subscription.unsubscribe()
  })
})
