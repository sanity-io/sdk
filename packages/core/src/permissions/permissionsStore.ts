import {createResource, type Resource} from '../resources/createResource'
import {subscribeToAuthEvents} from './actions/subscribeToAuthEvents'

/**
 * @public
 * User permission object
 */
export interface Permission {
  type: string
  name: string
  title: string
  description: string
  config: Record<string, unknown>
  ownerOrganizationId: string | null
  resourceType: string
  resourceId: string
}

/**
 * States tracked by the permissions store
 * @internal
 */
export interface PermissionsState {
  permissions: Permission[]
}

export const permissionsStore: Resource<PermissionsState> = createResource({
  name: 'permissionsStore',
  getInitialState: (): PermissionsState => {
    return {
      permissions: [],
    }
  },

  initialize() {
    const authEventSubscription = subscribeToAuthEvents(this)
    return () => {
      authEventSubscription.unsubscribe()
    }
  },
})
