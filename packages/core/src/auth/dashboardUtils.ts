import {bindActionGlobally} from '../store/createActionBinder'
import {type SanityInstance} from '../store/createSanityInstance'
import {createStateSourceAction} from '../store/createStateSourceAction'
import {authStore} from './authStore'

function getProjectIdsFromInstanceAndParents(instance: SanityInstance | undefined): string[] {
  if (!instance) return []

  const projectIds: string[] = []
  if (instance.config?.projectId) {
    projectIds.push(instance.config.projectId)
  }

  const parentProjectIds = getProjectIdsFromInstanceAndParents(instance.getParent())
  return projectIds.concat(parentProjectIds)
}

/**
 * Gets the dashboard organization ID from the auth store
 * @internal
 */
export const getDashboardOrganizationId = bindActionGlobally(
  authStore,
  createStateSourceAction(({instance, state: {dashboardContext}}) => {
    const projectIds = getProjectIdsFromInstanceAndParents(instance)
    console.log({projectIds})
    return dashboardContext?.orgId
  }),
)
