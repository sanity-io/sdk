import {bindActionGlobally} from '../store/createActionBinder'
import {createStateSourceAction} from '../store/createStateSourceAction'
import {authStore} from './authStore'

/**
 * Gets the dashboard organization ID from the auth store
 * @internal
 */
export const getDashboardOrganizationId = bindActionGlobally(
  authStore,
  createStateSourceAction(({state: {dashboardContext}}) => dashboardContext?.orgId),
)
