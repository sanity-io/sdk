import {applyDocumentActions, type SanityInstance} from '@sanity/sdk'
import {describe, it} from 'vitest'

import {useSanityInstance} from '../context/useSanityInstance'
import {useApplyDocumentActions} from './useApplyDocumentActions'

vi.mock('@sanity/sdk', async (importOriginal) => {
  const original = await importOriginal<typeof import('@sanity/sdk')>()
  return {...original, applyDocumentActions: vi.fn()}
})

vi.mock('../context/useSanityInstance')

// These are quite fragile mocks, but they are useful enough for now.
const instances: Record<string, SanityInstance | undefined> = {
  'p123.d': {__id: 'p123.d'} as unknown as SanityInstance,
  'p.d123': {__id: 'p.d123'} as unknown as SanityInstance,
  'p123.d123': {__id: 'p123.d123'} as unknown as SanityInstance,
}

const instance = {
  match({projectId = 'p', dataset = 'd'}): SanityInstance | undefined {
    return instances[`${projectId}.${dataset}`]
  },
} as unknown as SanityInstance

describe('useApplyDocumentActions', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(useSanityInstance).mockReturnValueOnce(instance)
  })

  it('uses the SanityInstance', async () => {
    const apply = useApplyDocumentActions()
    apply({
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

  it('uses SanityInstance.match when projectId is overrideen', async () => {
    const apply = useApplyDocumentActions()
    apply({
      type: 'document.edit',
      documentType: 'post',
      documentId: 'abc',

      projectId: 'p123',
    })

    expect(applyDocumentActions).toHaveBeenCalledExactlyOnceWith(instances['p123.d'], {
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

  it('uses SanityInstance when dataset is overrideen', async () => {
    const apply = useApplyDocumentActions()
    apply({
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

  it('uses SanityInstance.amcth when projectId and dataset is overrideen', async () => {
    const apply = useApplyDocumentActions()
    apply({
      type: 'document.edit',
      documentType: 'post',
      documentId: 'abc',

      projectId: 'p123',
      dataset: 'd123',
    })

    expect(applyDocumentActions).toHaveBeenCalledExactlyOnceWith(instances['p123.d123'], {
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

  it("throws if SanityInstance.match doesn't find anything", async () => {
    const apply = useApplyDocumentActions()
    expect(() => {
      apply({
        type: 'document.edit',
        documentType: 'post',
        documentId: 'abc',

        projectId: 'other',
      })
    }).toThrow()
  })
})
