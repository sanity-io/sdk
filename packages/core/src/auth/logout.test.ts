import {NEVER} from 'rxjs'
import {describe, it} from 'vitest'

import {createSanityInstance, type SanityInstance} from '../store/createSanityInstance'
import {AuthStateType} from './authStateType'
import {getAuthState} from './authStore'
import {logout} from './logout'
import {subscribeToStateAndFetchCurrentUser} from './subscribeToStateAndFetchCurrentUser'
import {subscribeToStorageEventsAndSetToken} from './subscribeToStorageEventsAndSetToken'
import {getTokenFromStorage} from './utils'

vi.mock('./utils', async (importOriginal) => {
  const original = await importOriginal<typeof import('./utils')>()
  return {...original, getTokenFromStorage: vi.fn()}
})

vi.mock('./subscribeToStateAndFetchCurrentUser')
vi.mock('./subscribeToStorageEventsAndSetToken')

let instance: SanityInstance | undefined

beforeEach(() => {
  vi.mocked(subscribeToStateAndFetchCurrentUser).mockImplementation(() => NEVER.subscribe())
  vi.mocked(subscribeToStorageEventsAndSetToken).mockImplementation(() => NEVER.subscribe())
})

afterEach(() => {
  instance?.dispose()
})

describe('logout', () => {
  it("calls '/auth/logout', sets the state to logged out, and removes any storage items", async () => {
    vi.mocked(getTokenFromStorage).mockReturnValue('token')
    const mockRequest = vi.fn().mockResolvedValue(undefined)
    const clientFactory = vi.fn().mockReturnValue({request: mockRequest})
    const removeItem = vi.fn() as Storage['removeItem']

    instance = createSanityInstance({
      projectId: 'p',
      dataset: 'd',
      auth: {
        clientFactory,
        storageArea: {removeItem} as Storage,
      },
    })

    const authState = getAuthState(instance)
    expect(authState.getCurrent()).toMatchObject({type: AuthStateType.LOGGED_IN})

    const logoutPromise = logout(instance)
    expect(authState.getCurrent()).toMatchObject({isDestroyingSession: true})
    await logoutPromise
    expect(authState.getCurrent()).toMatchObject({isDestroyingSession: false})

    expect(clientFactory).toHaveBeenCalledWith({
      apiVersion: '2021-06-07',
      requestTagPrefix: 'sanity.sdk.auth',
      token: 'token',
      useProjectHostname: false,
    })
    expect(mockRequest).toHaveBeenCalledWith({method: 'POST', uri: '/auth/logout'})
    expect(removeItem).toHaveBeenCalledWith('__sanity_auth_token')
  })

  it('returns early if there is a provided token', async () => {
    const clientFactory = vi.fn()
    const removeItem = vi.fn() as Storage['removeItem']
    instance = createSanityInstance({
      projectId: 'p',
      dataset: 'd',
      auth: {
        token: 'provided-token',
        clientFactory,
        storageArea: {removeItem} as Storage,
      },
    })

    await logout(instance)

    expect(clientFactory).not.toHaveBeenCalled()
    expect(removeItem).not.toHaveBeenCalled()
  })

  it('returns early if the session is already destroying', async () => {
    let resolveRequest!: () => void
    const requestPromise = new Promise<void>((resolve) => {
      resolveRequest = resolve
    })
    const request = vi.fn().mockReturnValue(requestPromise)
    const clientFactory = vi.fn().mockReturnValue({request})
    const removeItem = vi.fn() as Storage['removeItem']
    vi.mocked(getTokenFromStorage).mockReturnValue('token')

    instance = createSanityInstance({
      projectId: 'p',
      dataset: 'd',
      auth: {
        clientFactory,
        storageArea: {removeItem} as Storage,
      },
    })

    const authState = getAuthState(instance)
    expect(authState.getCurrent()).toMatchObject({type: AuthStateType.LOGGED_IN})

    const originalLogout = logout(instance)
    expect(authState.getCurrent()).toMatchObject({isDestroyingSession: true})

    // reset counts
    clientFactory.mockClear()
    vi.mocked(removeItem).mockClear()

    await logout(instance) // should early return

    expect(clientFactory).not.toHaveBeenCalled()
    expect(removeItem).not.toHaveBeenCalled()

    resolveRequest()

    await originalLogout
    expect(removeItem).toHaveBeenCalledOnce()
  })
})
