import {Subject} from 'rxjs'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {config} from '../../../test/fixtures'
import {AuthStateType} from '../../auth/authStateType'
import {getAuthState} from '../../auth/authStore'
import {getGlobalClient} from '../../client/actions/getGlobalClient'
import {createSanityInstance} from '../../instance/sanityInstance'
import {type SanityInstance} from '../../instance/types'
import {getOrCreateResource} from '../../resources/createResource'
import {type Permission, permissionsStore} from '../permissionsStore'
import {subscribeToAuthEvents} from './subscribeToAuthEvents'

vi.mock('../../client/actions/getGlobalClient')
vi.mock('../../auth/authStore')

describe('subscribeToAuthEvents', () => {
  let instance: SanityInstance
  let authSubject: Subject<{type: AuthStateType}>
  const mockPermissions: Permission[] = [
    {
      type: 'grant',
      name: 'sanity.project.read',
      title: 'Read Project',
      description: 'Read project data',
      config: {},
      ownerOrganizationId: 'org1',
      resourceType: 'project',
      resourceId: 'proj1',
    },
  ]

  beforeEach(() => {
    instance = createSanityInstance(config)
    authSubject = new Subject<{type: AuthStateType}>()
    vi.mocked(getAuthState).mockReturnValue({
      observable: authSubject.asObservable(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    vi.mocked(getGlobalClient).mockReturnValue({
      request: vi.fn().mockResolvedValue(mockPermissions),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    vi.clearAllMocks()

    // ensure state is initialized for this resource
    getOrCreateResource(instance, permissionsStore)
  })

  it('updates permissions when auth state changes to logged in', async () => {
    const store = getOrCreateResource(instance, permissionsStore)
    subscribeToAuthEvents({instance, state: store.state})
    expect(store.state.get().permissions).toEqual([])

    authSubject.next({type: AuthStateType.LOGGED_IN})

    // Wait for all promises to resolve
    await vi.waitFor(() => {
      expect(store.state.get().permissions).toEqual(mockPermissions)
    })

    expect(getGlobalClient).toHaveBeenCalledWith(instance)
  })

  it('clears permissions when logged out', async () => {
    const store = getOrCreateResource(instance, permissionsStore)
    subscribeToAuthEvents({instance, state: store.state})
    store.state.set('updatePermissions', {permissions: mockPermissions})

    authSubject.next({type: AuthStateType.LOGGED_OUT})

    await vi.waitFor(() => {
      expect(store.state.get().permissions).toEqual([])
    })
  })
})
