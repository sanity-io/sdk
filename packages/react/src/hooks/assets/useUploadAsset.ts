import {
  type SanityAssetDocument,
  type SanityImageAssetDocument,
  type UploadBody,
} from '@sanity/client'
import {uploadAsset, type UploadAssetOptions} from '@sanity/sdk'
import {useCallback} from 'react'

import {useSanityInstance} from '../context/useSanityInstance'

/**
 * @public
 * Returns a stable callback for uploading assets.
 *
 * Overloads ensure proper return typing based on `kind`.
 *
 * @example
 * ```tsx
 * const upload = useUploadAsset()
 * const onDrop = async (file: File) => {
 *   const image = await upload('image', file, {filename: file.name})
 * }
 * ```
 */
export function useUploadAsset(): {
  (kind: 'image', body: UploadBody, options?: UploadAssetOptions): Promise<SanityImageAssetDocument>
  (kind: 'file', body: UploadBody, options?: UploadAssetOptions): Promise<SanityAssetDocument>
} {
  const instance = useSanityInstance()
  return useCallback(
    (kind: 'image' | 'file', body: UploadBody, options?: UploadAssetOptions) =>
      kind === 'image'
        ? uploadAsset(instance, 'image', body, options)
        : uploadAsset(instance, 'file', body, options),
    [instance],
  ) as unknown as {
    (
      kind: 'image',
      body: UploadBody,
      options?: UploadAssetOptions,
    ): Promise<SanityImageAssetDocument>
    (kind: 'file', body: UploadBody, options?: UploadAssetOptions): Promise<SanityAssetDocument>
  }
}
