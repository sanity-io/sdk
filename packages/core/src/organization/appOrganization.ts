import {defer, filter, map, type Observable} from 'rxjs'

import {getDashboardOrganizationId} from '../auth/dashboardUtils'
import {isMessageBusEnvironment} from '../dashboard/messageBus/bus'
import {getTopicState} from '../dashboard/messageBus/topicStore'
import {type SanityInstance} from '../store/createSanityInstance'
import {type OrganizationBase} from './organization'

/** What the `organizations.current` topic publishes, `null` when none is selected. */
type CurrentOrganization = Pick<OrganizationBase, 'id' | 'name' | 'slug'> | null

/**
 * The organization the app itself belongs to, as opposed to the one that owns
 * any particular resource.
 *
 * Inside the Dashboard this arrives with the app, from whichever runtime is
 * hosting it. Outside it, `organizationId` on the `SanityConfig` says so.
 * Emits `undefined` when neither has one, leaving the caller to decide whether
 * that is fatal.
 *
 * @internal
 */
export function observeAppOrganizationId(instance: SanityInstance): Observable<string | undefined> {
  return observeDashboardOrganizationId(instance).pipe(
    map((organizationId) => organizationId ?? instance.config.organizationId),
  )
}

/**
 * The Dashboard's current organization, or `undefined` when the app is not
 * running in one.
 *
 * Both Dashboard runtimes are covered, the same way `useOrganizationId` covers
 * them. `isMessageBusEnvironment` is read per subscription rather than once at
 * module scope, because the host installs the bus and may not have run by the
 * time this module is first imported.
 */
function observeDashboardOrganizationId(instance: SanityInstance): Observable<string | undefined> {
  return defer(() => {
    if (!isMessageBusEnvironment()) {
      return getDashboardOrganizationId(instance).observable
    }

    return getTopicState(instance, 'organizations.current').observable.pipe(
      // `undefined` means the host has yet to publish, which is not the same as
      // there being no organization. Waiting keeps a read from resolving against
      // the config fallback and then changing organization a moment later.
      filter((organization) => organization !== undefined),
      map((organization) => (organization as CurrentOrganization)?.id),
    )
  })
}
