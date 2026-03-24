import {
  type CanvasResource,
  getClientState,
  type MediaLibraryResource,
  type SanityInstance,
} from '@sanity/sdk'
import {firstValueFrom} from 'rxjs'

const API_VERSION = 'v2026-03-01'

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
 * Fetches the media library and canvas resources for the given organization.
 * Each resource is fetched independently — a failure for one does not prevent
 * the other from resolving.
 */
export async function resolveOrgResources(
  instance: SanityInstance,
  organizationId: string,
): Promise<OrgResources> {
  const client = await firstValueFrom(
    getClientState(instance, {
      apiVersion: API_VERSION,
      scope: 'global',
      requestTagPrefix: 'sanity.sdk.org-resources',
    }).observable,
  )

  const [mediaLibrariesResult, canvasesResult] = await Promise.allSettled([
    client.request<OrgResourcesApiResponse>({
      url: `/media-libraries?organizationId=${encodeURIComponent(organizationId)}`,
    }),
    client.request<OrgResourcesApiResponse>({
      url: `/canvases?organizationId=${encodeURIComponent(organizationId)}`,
    }),
  ])

  return {
    mediaLibrary:
      mediaLibrariesResult.status === 'fulfilled' && mediaLibrariesResult.value.data?.[0]?.id
        ? {mediaLibraryId: mediaLibrariesResult.value.data[0].id}
        : undefined,
    canvas:
      canvasesResult.status === 'fulfilled' && canvasesResult.value.data?.[0]?.id
        ? {canvasId: canvasesResult.value.data[0].id}
        : undefined,
  }
}
