import {applyDocumentActions, createSanityInstance} from '@sanity/sdk'
import {describe, it} from 'vitest'

import {renderHook} from '../../../test/test-utils'
import {useSanityInstance} from '../context/useSanityInstance'
import {useApplyReleaseActions} from './useApplyReleaseActions'

// Resource resolution, mismatch detection, and context fallback are covered
// by hooks/helpers/useApplyActions.test.tsx — both this hook and
// useApplyDocumentActions are typed wrappers over that shared implementation.
// These tests just verify the wrapper forwards release actions through and
// supports batching them in a single transaction.

vi.mock('@sanity/sdk', async (importOriginal) => {
  const original = await importOriginal<typeof import('@sanity/sdk')>()
  return {...original, applyDocumentActions: vi.fn()}
})

vi.mock('../context/useSanityInstance')

const instance = createSanityInstance({projectId: 'p', dataset: 'd'})

describe('useApplyReleaseActions', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(useSanityInstance).mockReturnValueOnce(instance)
  })

  it('forwards a release action to applyDocumentActions with the resolved resource', () => {
    const {result} = renderHook(() => useApplyReleaseActions())
    result.current({type: 'release.create', releaseId: 'r1', metadata: {releaseType: 'asap'}})

    expect(applyDocumentActions).toHaveBeenCalledExactlyOnceWith(instance, {
      actions: [
        {
          type: 'release.create',
          releaseId: 'r1',
          metadata: {releaseType: 'asap'},
          resource: {projectId: 'test', dataset: 'test'},
        },
      ],
      resource: {projectId: 'test', dataset: 'test'},
    })
  })

  it('forwards an array of release actions as a single transaction', () => {
    const {result} = renderHook(() => useApplyReleaseActions())
    result.current([
      {type: 'release.create', releaseId: 'r1', metadata: {releaseType: 'asap'}},
      {type: 'release.publish', releaseId: 'r1'},
    ])

    expect(applyDocumentActions).toHaveBeenCalledExactlyOnceWith(instance, {
      actions: [
        {
          type: 'release.create',
          releaseId: 'r1',
          metadata: {releaseType: 'asap'},
          resource: {projectId: 'test', dataset: 'test'},
        },
        {type: 'release.publish', releaseId: 'r1', resource: {projectId: 'test', dataset: 'test'}},
      ],
      resource: {projectId: 'test', dataset: 'test'},
    })
  })
})
