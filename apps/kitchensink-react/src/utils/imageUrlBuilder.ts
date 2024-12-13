import {createClient} from '@sanity/client'
import imageUrlBuilder from '@sanity/image-url'
import {ImageUrlBuilder} from '@sanity/image-url/lib/types/builder'
import {useMemo} from 'react'

export function useImageUrlBuilder(): ImageUrlBuilder {
  const sanityClient = createClient({
    projectId: 'ppsg7ml5',
    dataset: 'test',
    useCdn: true,
    apiVersion: 'v2024-12-12',
  })
  return useMemo(() => imageUrlBuilder(sanityClient), [sanityClient])
}
