import {type SanityDocumentLike} from '@sanity/types'
import {of} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {type DocumentHandle} from '../config/sanityConfig'
import {createSanityInstance, type SanityInstance} from '../store/createSanityInstance'
import {type StateSource} from '../store/createStateSourceAction'
import {getProjectionState} from './getProjectionState'
import {type ProjectionValuePending, type ValidProjection} from './projectionStore'
import {resolveProjection} from './resolveProjection'

vi.mock('./getProjectionState')

describe('resolveProjection', () => {
  let instance: SanityInstance

  beforeEach(() => {
    vi.resetAllMocks()
    // Create a mock that returns the correct ProjectionValuePending type
    vi.mocked(getProjectionState).mockReturnValue({
      observable: of({
        data: {title: 'test'},
        isPending: false,
      } as ProjectionValuePending<Record<string, unknown>>),
    } as StateSource<ProjectionValuePending<Record<string, unknown>>>)

    instance = createSanityInstance({projectId: 'p', dataset: 'd'})
  })

  afterEach(() => {
    instance.dispose()
  })

  it('resolves a projection and returns the first emitted value with results', async () => {
    const docHandle: DocumentHandle<SanityDocumentLike> = {
      documentId: 'doc123',
      documentType: 'movie',
    }
    const projection = '{title}' as ValidProjection

    const result = await resolveProjection(instance, {...docHandle, projection})

    expect(getProjectionState).toHaveBeenCalledWith(instance, {...docHandle, projection})
    expect(result).toEqual({
      data: {title: 'test'},
      isPending: false,
    })
  })
})
