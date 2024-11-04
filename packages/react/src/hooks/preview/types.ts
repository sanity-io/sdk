import type {PreviewValue, SanityDocument} from '@sanity/types'

export interface PreviewState {
  draft?: PreviewValue | Partial<SanityDocument> | null
  published?: PreviewValue | Partial<SanityDocument> | null
  isLoading?: boolean | undefined
}
