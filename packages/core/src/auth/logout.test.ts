import {describe, it} from 'vitest'

import {createSanityInstance} from '../instance/sanityInstance'
import {createResourceState} from '../resources/createResource'
import {AuthStateType} from './authStateType'
import {authStore} from './authStore'
import {logout} from './logout'
import {getTokenFromStorage} from './utils'

vi.mock('./utils', async (importOriginal) => {
  const original = await importOriginal<typeof import('./utils')>()
  return {...original, getTokenFromStorage: vi.fn()}
})

describe('logout', () => {
  it("calls '/auth/logout', sets the state to logged out, and removes any storage items", async () => {
    vi.mocked(getTokenFromStorage).mockReturnValue('token')
    const mockRequest = vi.fn().mockResolvedValue(undefined)
    const mockClient = {request: mockRequest}
    const clientFactory = vi.fn().mockReturnValue(mockClient)
    const removeItem = vi.fn()
    const instance = createSanityInstance({
      projectId: 'p',
      dataset: 'd',
      auth: {
        clientFactory,
        storageArea: {removeItem} as unknown as Storage,
      },
    })

    const state = createResourceState(authStore.getInitialState(instance))

    const logoutPromise = logout({state, instance})
    expect(state.get()).toMatchObject({authState: {isDestroyingSession: true}})
    await logoutPromise
    expect(state.get()).toMatchObject({authState: {isDestroyingSession: false}})

    expect(clientFactory).toHaveBeenCalledWith({
      apiVersion: '2021-06-07',
      requestTagPrefix: 'sdk.auth',
      token: 'token',
      useProjectHostname: false,
    })
    expect(mockRequest).toHaveBeenCalledWith({method: 'POST', uri: '/auth/logout'})
    expect(removeItem).toHaveBeenCalledWith(state.get().options.storageKey)
  })

  it('returns early if there is a provided token', async () => {
    const clientFactory = vi.fn()
    const removeItem = vi.fn()
    const instance = createSanityInstance({
      projectId: 'p',
      dataset: 'd',
      auth: {
        token: 'provided-token',
        clientFactory,
        storageArea: {removeItem} as unknown as Storage,
      },
    })

    const state = createResourceState(authStore.getInitialState(instance))

    await logout({state, instance})

    expect(clientFactory).not.toHaveBeenCalled()
    expect(removeItem).not.toHaveBeenCalled()
  })

  it('returns early if the session is already destroying', async () => {
    const clientFactory = vi.fn()
    const removeItem = vi.fn()
    const instance = createSanityInstance({
      projectId: 'p',
      dataset: 'd',
      auth: {
        token: 'provided-token',
        clientFactory,
        storageArea: {removeItem} as unknown as Storage,
      },
    })

    const state = createResourceState(authStore.getInitialState(instance))
    state.set('setAlreadyDestroying', {
      authState: {type: AuthStateType.LOGGED_OUT, isDestroyingSession: true},
    })

    await logout({state, instance})
    expect(clientFactory).not.toHaveBeenCalled()
    expect(removeItem).not.toHaveBeenCalled()
  })
})
