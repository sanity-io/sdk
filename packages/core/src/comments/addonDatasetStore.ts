import {type SanityClient} from '@sanity/client'
import {
  catchError,
  distinctUntilChanged,
  EMPTY,
  filter,
  firstValueFrom,
  map,
  type Observable,
  of,
  switchMap,
  take,
} from 'rxjs'

import {getClient, getClientState} from '../client/clientStore'
import {
  type DatasetResource,
  type DocumentResource,
  isDatasetResource,
} from '../config/sanityConfig'
import {bindActionByResource, type BoundResourceKey} from '../store/createActionBinder'
import {type SanityInstance} from '../store/createSanityInstance'
import {createStateSourceAction, type StateSource} from '../store/createStateSourceAction'
import {defineStore, type StoreContext} from '../store/defineStore'
import {
  ADDON_DATASET_API_VERSION,
  ADDON_DATASET_PROFILE,
  COMMENTS_API_VERSION,
} from './commentsConstants'

interface AddonDatasetStoreState {
  /**
   * `unknown` until discovery answers. `missing` means the project has no
   * comments dataset yet, which is the normal state until someone writes a
   * first comment.
   */
  status: 'unknown' | 'resolved' | 'missing'
  datasetName?: string
  /** In flight provisioning, so concurrent first comments issue one POST. */
  provisioning?: Promise<string>
}

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

function isMissingOrForbidden(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('statusCode' in error)) return false
  const {statusCode} = error as {statusCode?: unknown}
  return statusCode === 403 || statusCode === 404
}

function requestAddonDataset(
  client: SanityClient,
  {projectId, dataset}: DatasetResource,
): Observable<string | undefined> {
  return client.observable
    .request<{name: string}[] | undefined>({
      uri: `/projects/${projectId}/datasets?datasetProfile=${ADDON_DATASET_PROFILE}&addonFor=${dataset}`,
      tag: 'comments.addon-dataset.list',
    })
    .pipe(map((datasets) => datasets?.[0]?.name))
}

function discover(
  instance: SanityInstance,
  resource: DatasetResource,
): Observable<string | undefined> {
  return getClientState(instance, {
    apiVersion: ADDON_DATASET_API_VERSION,
    projectId: resource.projectId,
    useProjectHostname: true,
  }).observable.pipe(
    switchMap((client) =>
      requestAddonDataset(client, resource).pipe(
        // A missing dataset and a dataset this user cannot see both mean there
        // are no comments to read. Transient failures stay pending so a new
        // authenticated client can retry discovery.
        catchError((error: unknown) => (isMissingOrForbidden(error) ? of(undefined) : EMPTY)),
      ),
    ),
  )
}

async function discoverOnce(
  instance: SanityInstance,
  resource: DatasetResource,
): Promise<string | undefined> {
  const client = await firstValueFrom(
    getClientState(instance, {
      apiVersion: ADDON_DATASET_API_VERSION,
      projectId: resource.projectId,
      useProjectHostname: true,
    }).observable.pipe(take(1)),
  )

  try {
    return await firstValueFrom(requestAddonDataset(client, resource))
  } catch (error) {
    if (isMissingOrForbidden(error)) return undefined
    throw error
  }
}

const addonDatasetStore = defineStore<AddonDatasetStoreState, BoundResourceKey>({
  name: 'CommentsAddonDataset',
  getInitialState: () => ({status: 'unknown'}),
  initialize: ({instance, state, key}) => {
    const resource = assertDatasetResource(key.resource)

    const subscription = discover(instance, resource).subscribe((datasetName) =>
      state.set(
        'setAddonDataset',
        datasetName ? {status: 'resolved', datasetName} : {status: 'missing'},
      ),
    )

    return () => subscription.unsubscribe()
  },
})

/**
 * The addon dataset's name: `undefined` while discovery is in flight, `null`
 * when the project has none yet.
 *
 * @internal
 */
export const getAddonDatasetState: (
  instance: SanityInstance,
  options: {resource?: DocumentResource},
) => StateSource<string | null | undefined> = bindActionByResource(
  addonDatasetStore,
  createStateSourceAction(({state}: {state: AddonDatasetStoreState}) => {
    if (state.status === 'unknown') return undefined
    return state.datasetName ?? null
  }),
)

/**
 * Resolves the addon dataset, creating it if the project has none.
 *
 * Safe to call concurrently: the first call owns the request and later ones
 * await the same promise. Provisioning is a one-time, project-wide side effect,
 * so this is only called from the write path, when we know there is a comment
 * to store.
 *
 * @internal
 */
export const provisionAddonDataset: (
  instance: SanityInstance,
  options: {resource?: DocumentResource},
) => Promise<string> = bindActionByResource(
  addonDatasetStore,
  ({instance, state, key}: StoreContext<AddonDatasetStoreState, BoundResourceKey>) => {
    const current = state.get()
    if (current.datasetName) return Promise.resolve(current.datasetName)
    if (current.provisioning) return current.provisioning

    const resource = assertDatasetResource(key.resource)

    const provisioning = (async () => {
      // Another user may have provisioned it since this client started up, in
      // which case creating it again would fail. Ask before writing.
      const existing = await discoverOnce(instance, resource)
      if (existing) return existing

      const client = getClient(instance, {
        apiVersion: ADDON_DATASET_API_VERSION,
        projectId: resource.projectId,
        useProjectHostname: true,
      })

      const response = await client.request<{datasetName?: string} | undefined>({
        uri: `/comments/${resource.dataset}/setup`,
        method: 'POST',
        tag: 'comments.addon-dataset.setup',
      })

      if (!response?.datasetName) {
        throw new Error('Creating the comments addon dataset returned no dataset name.')
      }

      return response.datasetName
    })()
      .then((datasetName) => {
        state.set('setAddonDataset', {
          status: 'resolved',
          datasetName,
          provisioning: undefined,
        })
        return datasetName
      })
      .catch((error: unknown) => {
        // Clear the in-flight promise so a retry is not permanently stuck on
        // this failure.
        state.set('clearProvisioning', {provisioning: undefined})
        throw error
      })

    state.set('startProvisioning', {provisioning})

    return provisioning
  },
)

/**
 * A client pointed at the addon dataset, or `null` while the project has none.
 *
 * Emits again whenever the dataset is discovered or provisioned, and whenever
 * the auth token changes. Long-lived readers must follow it rather than holding
 * a client, because the client store drops every cached client on a token
 * change.
 *
 * @internal
 */
export const observeAddonDatasetClient: (
  instance: SanityInstance,
  options: {resource?: DocumentResource},
) => Observable<SanityClient | null> = bindActionByResource(
  addonDatasetStore,
  ({instance, key}: StoreContext<AddonDatasetStoreState, BoundResourceKey>) => {
    const {projectId} = assertDatasetResource(key.resource)

    return getAddonDatasetState(instance, {resource: key.resource}).observable.pipe(
      distinctUntilChanged(),
      filter((datasetName): datasetName is string | null => datasetName !== undefined),
      switchMap((datasetName) =>
        typeof datasetName === 'string'
          ? getClientState(instance, {
              apiVersion: COMMENTS_API_VERSION,
              projectId,
              dataset: datasetName,
            }).observable
          : of(null),
      ),
    )
  },
)
