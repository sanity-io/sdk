import {type SanityClient} from '@sanity/client'
import {DocumentId, getPublishedId} from '@sanity/id-utils'
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
import {type StoredComment} from './types'

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
 * The global document reference a comment stores in `target.document._ref`.
 *
 * `client.collaboration.comments.getTargetDocumentRef` answers the same
 * question, but only from a client instance, and asking for one has side
 * effects: `getClient` writes the client it builds back into the client store.
 * The entry keys are computed inside a selector, which runs on every store
 * change and during render, so the ref has to come from the resource alone.
 *
 * Draft and version ids reduce to the published one, which is what makes a
 * single reference span every variant of a document.
 *
 * TODO: replace with `getCommentTargetDocumentRef` from `@sanity/client` once
 * the release carrying sanity-io/client#1343 is in the catalog. Until then the
 * parity test in `commentsClient.test.ts` is what keeps the two formats from
 * drifting.
 *
 * @internal
 */
export function toTargetDocumentRef(
  resource: DocumentResource,
  documentId: string,
): StoredComment['target']['document']['_ref'] {
  const {projectId, dataset} = assertDatasetResource(resource)
  return `dataset:${projectId}.${dataset}:${getPublishedId(DocumentId(documentId))}`
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
