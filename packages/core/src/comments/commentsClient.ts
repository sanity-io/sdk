import {type SanityClient} from '@sanity/client'
import {DocumentId, getPublishedId} from '@sanity/id-utils'
import {
  defer,
  distinctUntilChanged,
  EMPTY,
  map,
  merge,
  mergeMap,
  type Observable,
  of,
  switchMap,
  throwError,
} from 'rxjs'

import {type ClientOptions, getClient, getClientState} from '../client/clientStore'
import {
  type DatasetResource,
  type DocumentResource,
  isDatasetResource,
} from '../config/sanityConfig'
import {observeAppOrganizationId} from '../organization/appOrganization'
import {compareProjectOrganization} from '../project/organizationVerification'
import {project} from '../project/project'
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
 * The organization whose comments a resource's comments live in.
 *
 * Comments are stored per organization rather than per dataset, so a resource
 * alone does not say where they are. The app's own organization answers it
 * when there is one — the Dashboard supplies it, or `organizationId` on the
 * config does. Failing that, the project's owning organization is the answer,
 * since a project belongs to exactly one.
 *
 * A configured organization is used as soon as it is known, and checked
 * against the project's in parallel. Waiting for the check would delay every
 * first read to save a request that the API would refuse anyway; the check is
 * here to say plainly that the two disagree, and erroring the stream is enough
 * for that.
 *
 * @internal
 */
export function observeCommentsOrganizationId(
  instance: SanityInstance,
  resource: DocumentResource,
): Observable<string> {
  const {projectId} = assertDatasetResource(resource)
  // `includeMembers: false` is what lets this be served from the projects list
  // an app has usually already read, rather than a request of its own.
  const projectOrganizationId$ = defer(() =>
    project.resolveState(instance, {projectId, includeMembers: false}),
  ).pipe(map((fetched) => fetched.organizationId))

  return observeAppOrganizationId(instance).pipe(
    switchMap((appOrganizationId) => {
      if (!appOrganizationId) return projectOrganizationId$

      return merge(
        of(appOrganizationId),
        projectOrganizationId$.pipe(
          mergeMap((projectOrganizationId) => {
            const {error} = compareProjectOrganization(
              projectId,
              projectOrganizationId,
              appOrganizationId,
            )
            return error ? throwError(() => new Error(error)) : EMPTY
          }),
        ),
      )
    }),
    distinctUntilChanged(),
  )
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
 */
function observeCommentsClient(
  instance: SanityInstance,
  options: {resource: DocumentResource; organizationId: string},
): Observable<SanityClient> {
  return getClientState(instance, toClientOptions(options.resource, options.organizationId))
    .observable
}

/**
 * The same, for a caller that has only a resource and needs the organization
 * resolved first.
 *
 * @internal
 */
export function observeCommentsClientForResource(
  instance: SanityInstance,
  resource: DocumentResource,
): Observable<SanityClient> {
  return observeCommentsOrganizationId(instance, resource).pipe(
    switchMap((organizationId) => observeCommentsClient(instance, {resource, organizationId})),
  )
}
