import {PassThrough} from 'node:stream'
import {type Gzip} from 'node:zlib'

import {type SanityClient} from '@sanity/client'
import FormData from 'form-data'

/**
 * @internal
 */
export interface CreateDeploymentOptions {
  client: SanityClient
  applicationId: string
  version: string
  tarball: Gzip
}

/**
 * Creates a deployment for the given user application.
 *
 * @internal
 */
export async function createDeployment({
  client,
  tarball,
  applicationId,
  version,
}: CreateDeploymentOptions): Promise<{location: string}> {
  const formData = new FormData()
  formData.append('version', version)
  formData.append('tarball', tarball, {contentType: 'application/gzip', filename: 'app.tar.gz'})

  return client.request({
    uri: `/user-applications/${applicationId}/deployments`,
    method: 'POST',
    headers: formData.getHeaders(),
    body: formData.pipe(new PassThrough()),
  })
}
