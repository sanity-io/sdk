import {
  type CanvasResource,
  getClientState,
  type MediaLibraryResource,
  type SanityInstance,
} from '@sanity/sdk'
import {firstValueFrom} from 'rxjs'

const API_VERSION = 'v2026-07-09'

interface OrgResourcesApiItem {
  id: string
}

interface OrgResourcesApiResponse {
  data: OrgResourcesApiItem[]
}

interface OrgResources {
  mediaLibrary?: MediaLibraryResource
  canvas?: CanvasResource
}

/**
 * Gets the id of the first resource from a settled request result. The request
 * is already scoped to a single organization, so the first item is the one we want.
 */
function getFirstResourceId(
  result: PromiseSettledResult<OrgResourcesApiResponse>,
): string | undefined {
  if (result.status !== 'fulfilled') return undefined
  return result.value.data?.[0]?.id
}

/**
 * Fetches the media library and canvas resources for the given organization.
 * Both requests are scoped to `organizationId` so each response contains only
 * that org's resources. Each resource is fetched independently — a failure for
 * one does not prevent the other from resolving.
 */
export async function resolveOrgResources(
  instance: SanityInstance,
  organizationId: string,
): Promise<OrgResources> {
  const client = await firstValueFrom(
    getClientState(instance, {apiVersion: API_VERSION, scope: 'global'}).observable,
  )

  const [mediaLibrariesResult, canvasesResult] = await Promise.allSettled([
    client.request<OrgResourcesApiResponse>({
      uri: `/media-libraries`,
      query: {organizationId},
      tag: 'org-resources.media-libraries',
    }),
    client.request<OrgResourcesApiResponse>({
      uri: `/canvases`,
      query: {organizationId},
      tag: 'org-resources.canvases',
    }),
  ])

  const mediaLibraryId = getFirstResourceId(mediaLibrariesResult)
  const canvasId = getFirstResourceId(canvasesResult)

  return {
    mediaLibrary: mediaLibraryId ? {mediaLibraryId} : undefined,
    canvas: canvasId ? {canvasId} : undefined,
  }
}
