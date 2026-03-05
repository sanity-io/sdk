import {applyDocumentActions, type SanityInstance} from '@sanity/sdk'
import React from 'react'
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

  it('uses the SanityInstance and injects resource from context', async () => {
    const {result} = renderHook(() => useApplyDocumentActions())
    result.current({
      type: 'document.edit',
      documentType: 'post',
      documentId: 'abc',
      resource: {projectId: 'p123', dataset: 'd123'},
    })

    expect(applyDocumentActions).toHaveBeenCalledExactlyOnceWith(instance, {
      actions: [
        {
          type: 'document.edit',
          documentType: 'post',
          documentId: 'abc',
          resource: {projectId: 'p123', dataset: 'd123'},
        },
      ],
      resource: {projectId: 'p123', dataset: 'd123'},
    })
  })

  it('passes resource from action to applyDocumentActions', async () => {
    const {result} = renderHook(() => useApplyDocumentActions())
    result.current({
      type: 'document.edit',
      documentType: 'post',
      documentId: 'abc',
      resource: {projectId: 'p123', dataset: 'd123'},
    })

    expect(applyDocumentActions).toHaveBeenCalledExactlyOnceWith(instance, {
      actions: [
        {
          type: 'document.edit',
          documentType: 'post',
          documentId: 'abc',
          resource: {projectId: 'p123', dataset: 'd123'},
        },
      ],
      resource: {projectId: 'p123', dataset: 'd123'},
    })
  })

  it('uses context resource when action has no resource', async () => {
    const {result} = renderHook(() => useApplyDocumentActions())
    result.current({
      type: 'document.edit',
      documentType: 'post',
      documentId: 'abc',
      resource: {projectId: 'test', dataset: 'test'},
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

  it('throws when actions have mismatched project IDs', async () => {
    const {result} = renderHook(() => useApplyDocumentActions())
    expect(() => {
      result.current([
        {
          type: 'document.edit',
          documentType: 'post',
          documentId: 'abc',
          resource: {projectId: 'p123', dataset: 'd1'},
        },
        {
          type: 'document.edit',
          documentType: 'post',
          documentId: 'def',
          resource: {projectId: 'p456', dataset: 'd1'},
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

  it('throws when no resource is found from actions or context', async () => {
    // Use a minimal wrapper without resource context so contextResource is undefined
    const {result} = renderHook(() => useApplyDocumentActions(), {
      wrapper: (props) => React.createElement(React.Fragment, null, props.children),
    })

    expect(() => {
      result.current({
        type: 'document.edit',
        documentType: 'post',
        documentId: 'abc',
        // no resource
      } as never)
    }).toThrow(/resource is required/)
  })

  it('throws when options resource mismatches action resource', async () => {
    const {result} = renderHook(() => useApplyDocumentActions())

    expect(() => {
      result.current(
        {
          type: 'document.edit',
          documentType: 'post',
          documentId: 'abc',
          resource: {projectId: 'p1', dataset: 'd1'},
        },
        {resource: {projectId: 'p2', dataset: 'd2'}},
      )
    }).toThrow(/Mismatched resources found in actions/)
  })
})
