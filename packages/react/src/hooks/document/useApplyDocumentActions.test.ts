import {applyDocumentActions, type SanityInstance} from '@sanity/sdk'
import {describe, it} from 'vitest'

import {renderHook} from '../../../test/test-utils'
import {useSanityInstance} from '../context/useSanityInstance'
import {useApplyDocumentActions} from './useApplyDocumentActions'

vi.mock('@sanity/sdk', async (importOriginal) => {
  const original = await importOriginal<typeof import('@sanity/sdk')>()
  return {...original, applyDocumentActions: vi.fn()}
})

vi.mock('../context/useSanityInstance')

const instance = {instanceId: 'test'} as unknown as SanityInstance

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
        },
      ],
    })
  })

  it('passes actions with projectId override to the context instance', async () => {
    const {result} = renderHook(() => useApplyDocumentActions())
    result.current({
      type: 'document.edit',
      documentType: 'post',
      documentId: 'abc',
      projectId: 'p123',
    })

    expect(applyDocumentActions).toHaveBeenCalledExactlyOnceWith(instance, {
      actions: [
        {
          type: 'document.edit',
          documentType: 'post',
          documentId: 'abc',
          projectId: 'p123',
        },
      ],
    })
  })

  it('passes actions with dataset override to the context instance', async () => {
    const {result} = renderHook(() => useApplyDocumentActions())
    result.current({
      type: 'document.edit',
      documentType: 'post',
      documentId: 'abc',
      dataset: 'd123',
    })

    expect(applyDocumentActions).toHaveBeenCalledExactlyOnceWith(instance, {
      actions: [
        {
          type: 'document.edit',
          documentType: 'post',
          documentId: 'abc',
          dataset: 'd123',
        },
      ],
    })
  })

  it('passes actions with both projectId and dataset overrides', async () => {
    const {result} = renderHook(() => useApplyDocumentActions())
    result.current({
      type: 'document.edit',
      documentType: 'post',
      documentId: 'abc',
      projectId: 'p123',
      dataset: 'd123',
    })

    expect(applyDocumentActions).toHaveBeenCalledExactlyOnceWith(instance, {
      actions: [
        {
          type: 'document.edit',
          documentType: 'post',
          documentId: 'abc',
          projectId: 'p123',
          dataset: 'd123',
        },
      ],
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
        },
        {
          type: 'document.edit',
          documentType: 'post',
          documentId: 'def',
          projectId: 'p456',
        },
      ])
    }).toThrow(/Mismatched project IDs found in actions/)
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
    }).toThrow(/Mismatched datasets found in actions/)
  })

  it('throws when actions have mismatched sources', async () => {
    const {result} = renderHook(() => useApplyDocumentActions())
    expect(() => {
      result.current([
        {
          type: 'document.edit',
          documentType: 'post',
          documentId: 'abc',
          source: {projectId: 'p', dataset: 'd1'},
        },
        {
          type: 'document.edit',
          documentType: 'post',
          documentId: 'def',
          source: {projectId: 'p', dataset: 'd2'},
        },
      ])
    }).toThrow(/Mismatched sources found in actions/)
  })

  it('throws when mixing projectId and source (projectId first)', async () => {
    const {result} = renderHook(() => useApplyDocumentActions())
    expect(() => {
      result.current([
        {
          type: 'document.edit',
          documentType: 'post',
          documentId: 'abc',
          projectId: 'p',
        },
        {
          type: 'document.edit',
          documentType: 'post',
          documentId: 'def',
          source: {projectId: 'p', dataset: 'd'},
        },
      ])
    }).toThrow(/Mismatches between projectId\/dataset options and source/)
  })

  it('throws when mixing source and projectId (source first)', async () => {
    const {result} = renderHook(() => useApplyDocumentActions())
    expect(() => {
      result.current([
        {
          type: 'document.edit',
          documentType: 'post',
          documentId: 'abc',
          source: {projectId: 'p', dataset: 'd'},
        },
        {
          type: 'document.edit',
          documentType: 'post',
          documentId: 'def',
          projectId: 'p',
        },
      ])
    }).toThrow(/Mismatches between projectId\/dataset options and source/)
  })
})
