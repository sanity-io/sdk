import {type SanityClient} from '@sanity/client'
import {type Observable} from 'rxjs'

import {type ClientOptions, getClient, getClientState} from '../client/clientStore'
import {
  type DatasetHandle,
  type DatasetResource,
  type DocumentResource,
  isDatasetResource,
} from '../config/sanityConfig'
import {type SanityInstance} from '../store/createSanityInstance'
import {COMMENTS_API_VERSION} from './commentsConstants'

/**
 * Comments need a project and a dataset. There is nowhere to put them for a
 * media library or a canvas, and no Studio to interoperate with either.
 *
 * @internal
 */
export function assertDatasetResource(resource: DocumentResource): DatasetResource {
  if (!isDatasetResource(resource)) {
    throw new Error(
      `Comments are only supported for dataset resources, received: ${JSON.stringify(resource)}`,
    )
  }
  return resource
}

/**
 * The organization whose comments a call addresses.
 *
 * Comments are stored per organization rather than per dataset, and nothing in
 * a dataset handle implies which organization owns it, so this has to be
 * configured. A per-call value wins over the instance default, matching how
 * `projectId` and `dataset` resolve.
 *
 * @internal
 */
export function requireOrganizationId(
  instance: SanityInstance,
  options: Pick<DatasetHandle, 'collaboration'>,
): string {
  const organizationId = (options.collaboration ?? instance.config.collaboration)?.organizationId

  if (!organizationId) {
    throw new Error(
      'Comments require an organization. Pass `collaboration: {organizationId}` to this call, ' +
        'or set it on the Sanity config so every call inherits it.',
    )
  }

  return organizationId
}

/**
 * A dataset resource keeps the project API domain, which is what avoids the
 * CORS and Studio auth cookie problems a global host would bring. The client
 * derives the comment API's `resourceType`/`resourceId` from `projectId` and
 * `dataset` itself.
 */
function toClientOptions(resource: DocumentResource, organizationId: string): ClientOptions {
  return {
    apiVersion: COMMENTS_API_VERSION,
    resource: assertDatasetResource(resource),
    collaboration: {organizationId},
  }
}

/**
 * A client for the comment API, for a single request.
 *
 * @internal
 */
export function getCommentsClient(
  instance: SanityInstance,
  options: {resource: DocumentResource; organizationId: string},
): SanityClient {
  return getClient(instance, toClientOptions(options.resource, options.organizationId))
}

/**
 * A client for the comment API that emits again whenever the auth token
 * changes.
 *
 * Long-lived readers must follow this rather than holding a client, because the
 * client store drops every cached client on a token change.
 *
 * @internal
 */
export function observeCommentsClient(
  instance: SanityInstance,
  options: {resource: DocumentResource; organizationId: string},
): Observable<SanityClient> {
  return getClientState(instance, toClientOptions(options.resource, options.organizationId))
    .observable
}
