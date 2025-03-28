import {type SanityDocumentLike} from '@sanity/types'
import {of} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {type DocumentHandle} from '../config/sanityConfig'
import {createSanityInstance, type SanityInstance} from '../store/createSanityInstance'
import {type StateSource} from '../store/createStateSourceAction'
import {getPreviewState} from './getPreviewState'
import {type PreviewValue, type ValuePending} from './previewStore'
import {resolvePreview} from './resolvePreview'

vi.mock('./getPreviewState')

describe('resolvePreview', () => {
  let instance: SanityInstance

  beforeEach(() => {
    vi.resetAllMocks()
    // Create a mock that returns the correct ValuePending type
    vi.mocked(getPreviewState).mockReturnValue({
      observable: of({
        data: {title: 'test'},
        isPending: false,
      } as ValuePending<PreviewValue>),
    } as StateSource<ValuePending<PreviewValue>>)

    instance = createSanityInstance({projectId: 'p', dataset: 'd'})
  })

  afterEach(() => {
    instance.dispose()
  })

  it('resolves a preview and returns the first emitted value with results', async () => {
    const docHandle: DocumentHandle<SanityDocumentLike> = {
      documentId: 'doc123',
      documentType: 'movie',
    }

    const result = await resolvePreview(instance, docHandle)

    expect(getPreviewState).toHaveBeenCalledWith(instance, docHandle)
    expect(result).toEqual({
      data: {title: 'test'},
      isPending: false,
    })
  })
})
