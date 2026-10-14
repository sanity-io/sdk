import {map, type Observable} from 'rxjs'

import {observeDashboardOrganizationId} from '../dashboard/messageBus/topicStore'
import {type SanityInstance} from '../store/createSanityInstance'

/**
 * The organization the app itself belongs to, as opposed to the one that owns
 * any particular resource.
 *
 * Inside the Dashboard this arrives with the app, from whichever runtime is
 * hosting it, which is what `observeDashboardOrganizationId` reads. Outside it,
 * `organizationId` on the `SanityConfig` says so. Emits `undefined` when
 * neither has one, leaving the caller to decide whether that is fatal.
 *
 * @internal
 */
export function observeAppOrganizationId(instance: SanityInstance): Observable<string | undefined> {
  return observeDashboardOrganizationId(instance).pipe(
    map((organizationId) => organizationId ?? instance.config.organizationId),
  )
}
