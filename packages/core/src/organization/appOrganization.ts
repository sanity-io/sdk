import {defer, filter, map, type Observable} from 'rxjs'

import {getDashboardMessageBus} from '../dashboard/messageBus/store'
import {getDashboardOrganizationId, getTopicState} from '../dashboard/messageBus/topicStore'
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
 * @remarks
 * On a message bus this waits for the host's first `organizations.current`
 * publish, with no deadline: a host that never publishes leaves comment reads
 * and organization-scoped user lists unresolved rather than failing. Waiting is
 * deliberate, since resolving against the config first would point a read at one
 * organization and then another. The topic is shared, so a failure another
 * reader's `resolveTopic` records on it errors this stream too.
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
 * Both Dashboard runtimes are covered, the same way `getDashboardOrganizationId`
 * covers them: the topic once this instance has a bus connection, and `_context`
 * otherwise. The connection is read per subscription rather than once at module
 * scope, because the host installs the bus and may not have run by the time this
 * module is first imported.
 */
function observeDashboardOrganizationId(instance: SanityInstance): Observable<string | undefined> {
  return defer(() => {
    if (!getDashboardMessageBus(instance)) {
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
