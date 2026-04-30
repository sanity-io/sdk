import {applyDocumentActions, createSanityInstance} from '@sanity/sdk'
import {describe, it} from 'vitest'

import {renderHook} from '../../../test/test-utils'
import {useSanityInstance} from '../context/useSanityInstance'
import {useApplyDocumentActions} from './useApplyDocumentActions'

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

  it('uses the SanityInstance', async () => {
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
          resource: {projectId: 'p', dataset: 'd'},
        },
      ],
      resource: {projectId: 'p', dataset: 'd'},
    })
  })

  it('resolves resource from projectId and dataset in action', async () => {
    const {result} = renderHook(() => useApplyDocumentActions())
    result.current({
      type: 'document.edit',
      documentType: 'post',
      documentId: 'abc',
      projectId: 'p',
      dataset: 'd123',
    })

    expect(applyDocumentActions).toHaveBeenCalledExactlyOnceWith(instance, {
      actions: [
        {
          type: 'document.edit',
          documentType: 'post',
          documentId: 'abc',
          resource: {projectId: 'p', dataset: 'd123'},
        },
      ],
      resource: {projectId: 'p', dataset: 'd123'},
    })
  })

  it('throws when actions have mismatched project IDs', async () => {
    const {result} = renderHook(() => useApplyDocumentActions())
    expect(() => {
      result.current([
        {
          type: 'document.edit',
          documentType: 'post',
          documentId: 'abc',
          projectId: 'p123',
          dataset: 'd',
        },
        {
          type: 'document.edit',
          documentType: 'post',
          documentId: 'def',
          projectId: 'p456',
          dataset: 'd',
        },
      ])
    }).toThrow(/Mismatched resources found in actions/)
  })

  it('throws when actions have mismatched datasets', async () => {
    const {result} = renderHook(() => useApplyDocumentActions())
    expect(() => {
      result.current([
        {
          type: 'document.edit',
          documentType: 'post',
          documentId: 'abc',
          projectId: 'p',
          dataset: 'd1',
        },
        {
          type: 'document.edit',
          documentType: 'post',
          documentId: 'def',
          projectId: 'p',
          dataset: 'd2',
        },
      ])
    }).toThrow(/Mismatched resources found in actions/)
  })

  it('throws when actions have mismatched resources', async () => {
    const {result} = renderHook(() => useApplyDocumentActions())
    expect(() => {
      result.current([
        {
          type: 'document.edit',
          documentType: 'post',
          documentId: 'abc',
          resource: {projectId: 'p', dataset: 'd1'},
        },
        {
          type: 'document.edit',
          documentType: 'post',
          documentId: 'def',
          resource: {projectId: 'p', dataset: 'd2'},
        },
      ])
    }).toThrow(/Mismatched resources found in actions/)
  })

  it('throws when mixing projectId/dataset and resource with a mismatch (projectId first)', async () => {
    const {result} = renderHook(() => useApplyDocumentActions())
    expect(() => {
      result.current([
        {
          type: 'document.edit',
          documentType: 'post',
          documentId: 'abc',
          projectId: 'p1',
          dataset: 'd',
        },
        {
          type: 'document.edit',
          documentType: 'post',
          documentId: 'def',
          resource: {projectId: 'p2', dataset: 'd'},
        },
      ])
    }).toThrow(/Mismatched resources found in actions/)
  })

  it('throws when mixing resource and projectId/dataset with a mismatch (resource first)', async () => {
    const {result} = renderHook(() => useApplyDocumentActions())
    expect(() => {
      result.current([
        {
          type: 'document.edit',
          documentType: 'post',
          documentId: 'abc',
          resource: {projectId: 'p1', dataset: 'd'},
        },
        {
          type: 'document.edit',
          documentType: 'post',
          documentId: 'def',
          projectId: 'p2',
          dataset: 'd',
        },
      ])
    }).toThrow(/Mismatched resources found in actions/)
  })
})
