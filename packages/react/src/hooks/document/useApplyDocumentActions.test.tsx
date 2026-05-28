import {applyDocumentActions, createSanityInstance} from '@sanity/sdk'
import {describe, it} from 'vitest'

import {renderHook} from '../../../test/test-utils'
import {useSanityInstance} from '../context/useSanityInstance'
import {useApplyDocumentActions} from './useApplyDocumentActions'

// Resource resolution, mismatch detection, and context fallback are covered
// by hooks/helpers/useApplyActions.test.tsx — both this hook and
// useApplyReleaseActions are typed wrappers over that shared implementation.
// These tests just verify the wrapper forwards document actions through.

vi.mock('@sanity/sdk', async (importOriginal) => {
  const original = await importOriginal<typeof import('@sanity/sdk')>()
  return {...original, applyDocumentActions: vi.fn()}
})

vi.mock('../context/useSanityInstance')

const instance = createSanityInstance({projectId: 'p', dataset: 'd'})

describe('useApplyDocumentActions', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(useSanityInstance).mockReturnValueOnce(instance)
  })

  it('forwards a document action to applyDocumentActions with the resolved resource', () => {
    const {result} = renderHook(() => useApplyDocumentActions())
    result.current({
      type: 'document.edit',
      documentType: 'post',
      documentId: 'abc',
    })

    expect(applyDocumentActions).toHaveBeenCalledExactlyOnceWith(instance, {
      actions: [
        {
          type: 'document.edit',
          documentType: 'post',
          documentId: 'abc',
          resource: {projectId: 'test', dataset: 'test'},
        },
      ],
      resource: {projectId: 'test', dataset: 'test'},
    })
  })
})
