import {createSanityInstance, type DocumentHandle} from '@sanity/sdk'
import {type ReactNode} from 'react'
import {describe, expect, it} from 'vitest'

import {renderHook, resources} from '../../../test/test-utils'
import {ResourceProvider} from '../../context/ResourceProvider'
import {ResourcesContext} from '../../context/ResourcesContext'
import {SanityInstanceContext} from '../../context/SanityInstanceContext'
import {useNormalizedResourceOptions} from './useNormalizedResourceOptions'

// Wrapper that sets ResourceContext via the `resource` prop (tier 3).
// Includes ResourcesContext so resourceName resolution also works in these tests.
function ResourceContextWrapper({
  children,
  resource,
}: {
  children: ReactNode
  resource: {projectId: string; dataset: string}
}) {
  return (
    <ResourceProvider resource={resource} fallback={null}>
      <ResourcesContext.Provider value={resources}>{children}</ResourcesContext.Provider>
    </ResourceProvider>
  )
}

// Wrapper that provides an instance with no projectId/dataset and no ResourceContext (tier 5).
const bareInstance = createSanityInstance({})
function NoResourceWrapper({children}: {children: ReactNode}) {
  return (
    <SanityInstanceContext.Provider value={bareInstance}>{children}</SanityInstanceContext.Provider>
  )
}

describe('useNormalizedResourceOptions', () => {
  describe('tier 1 — explicit options', () => {
    it('uses an explicit dataset resource object', () => {
      const {result} = renderHook(() =>
        useNormalizedResourceOptions({resource: {projectId: 'explicit', dataset: 'explicit-ds'}}),
      )
      expect(result.current.resource).toEqual({projectId: 'explicit', dataset: 'explicit-ds'})
    })

    it('uses an explicit media-library resource object', () => {
      const {result} = renderHook(() =>
        useNormalizedResourceOptions({resource: {mediaLibraryId: 'ml-123'}}),
      )
      expect(result.current.resource).toEqual({mediaLibraryId: 'ml-123'})
    })

    it('uses an explicit canvas resource object', () => {
      const {result} = renderHook(() =>
        useNormalizedResourceOptions({resource: {canvasId: 'canvas-123'}}),
      )
      expect(result.current.resource).toEqual({canvasId: 'canvas-123'})
    })

    it('resolves resourceName to a named dataset resource', () => {
      const {result} = renderHook(() => useNormalizedResourceOptions({resourceName: 'dataset'}))
      expect(result.current.resource).toEqual({
        projectId: 'resource-project-id',
        dataset: 'resource-dataset',
      })
    })

    it('resolves resourceName to a named media-library resource', () => {
      const {result} = renderHook(() =>
        useNormalizedResourceOptions({resourceName: 'media-library'}),
      )
      expect(result.current.resource).toEqual({mediaLibraryId: 'media-library-id'})
    })

    it('resolves resourceName to a named canvas resource', () => {
      const {result} = renderHook(() => useNormalizedResourceOptions({resourceName: 'canvas'}))
      expect(result.current.resource).toEqual({canvasId: 'canvas-id'})
    })

    it('throws when resourceName is not registered', () => {
      expect(() =>
        renderHook(() => useNormalizedResourceOptions({resourceName: 'unknown'})),
      ).toThrow(/no resource named/i)
    })

    it('throws when both resource and resourceName are provided', () => {
      expect(() =>
        renderHook(() =>
          useNormalizedResourceOptions({
            resource: {projectId: 'p', dataset: 'd'},
            resourceName: 'dataset',
          }),
        ),
      ).toThrow()
    })

    it('resolves deprecated `source` as `resource`', () => {
      const {result} = renderHook(() =>
        useNormalizedResourceOptions({source: {projectId: 'src', dataset: 'src-ds'}}),
      )
      expect(result.current.resource).toEqual({projectId: 'src', dataset: 'src-ds'})
    })

    it('resolves deprecated `sourceName` as `resourceName`', () => {
      const {result} = renderHook(() => useNormalizedResourceOptions({sourceName: 'dataset'}))
      expect(result.current.resource).toEqual({
        projectId: 'resource-project-id',
        dataset: 'resource-dataset',
      })
    })
  })

  describe('tier 2 — bare projectId/dataset in options', () => {
    it('synthesizes a resource from projectId + dataset', () => {
      const {result} = renderHook(() =>
        useNormalizedResourceOptions({projectId: 'opt', dataset: 'opt-ds'}),
      )
      expect(result.current.resource).toEqual({projectId: 'opt', dataset: 'opt-ds'})
    })

    it('falls through to context when only projectId is provided (no dataset)', () => {
      // Only projectId is not enough to synthesize — should fall back to context resource
      const {result} = renderHook(() => useNormalizedResourceOptions({projectId: 'opt'}))
      // Default test-utils: ResourceProvider projectId="test" dataset="test" → tier-3 via config synthesis
      expect(result.current.resource).toEqual({projectId: 'test', dataset: 'test'})
    })
  })

  describe('tier 3 — ResourceContext', () => {
    it('uses ResourceContext set via ResourceProvider `resource` prop', () => {
      const contextResource = {projectId: 'ctx-project', dataset: 'ctx-dataset'}
      const {result} = renderHook(() => useNormalizedResourceOptions({}), {
        wrapper: ({children}) => (
          <ResourceContextWrapper resource={contextResource}>{children}</ResourceContextWrapper>
        ),
      })
      expect(result.current.resource).toEqual(contextResource)
    })

    it('uses ResourceContext synthesized from ResourceProvider projectId/dataset', () => {
      // ResourceProvider with projectId/dataset (no explicit resource prop) synthesizes ResourceContext
      const {result} = renderHook(() => useNormalizedResourceOptions({}))
      // Default test-utils: ResourceProvider projectId="test" dataset="test"
      expect(result.current.resource).toEqual({projectId: 'test', dataset: 'test'})
    })

    it('explicit resource in options takes precedence over ResourceContext', () => {
      const {result} = renderHook(
        () =>
          useNormalizedResourceOptions({resource: {projectId: 'explicit', dataset: 'explicit-ds'}}),
        {
          wrapper: ({children}) => (
            <ResourceContextWrapper resource={{projectId: 'ctx-project', dataset: 'ctx-dataset'}}>
              {children}
            </ResourceContextWrapper>
          ),
        },
      )
      expect(result.current.resource).toEqual({projectId: 'explicit', dataset: 'explicit-ds'})
    })
  })

  describe('tier 4 — SanityInstance config fallback', () => {
    it('falls back to instance projectId/dataset when ResourceContext is not set', () => {
      // Bare SanityInstanceContext with config — no ResourceProvider, so no ResourceContext
      const instanceWithConfig = createSanityInstance({projectId: 'inst', dataset: 'inst-ds'})
      const {result} = renderHook(() => useNormalizedResourceOptions({}), {
        wrapper: ({children}) => (
          <SanityInstanceContext.Provider value={instanceWithConfig}>
            {children}
          </SanityInstanceContext.Provider>
        ),
      })
      expect(result.current.resource).toEqual({projectId: 'inst', dataset: 'inst-ds'})
    })
  })

  describe('tier 5 — no resource available', () => {
    it('returns no resource when neither options, context, nor instance config provide one', () => {
      const {result} = renderHook(() => useNormalizedResourceOptions({}), {
        wrapper: NoResourceWrapper,
      })
      expect(result.current).not.toHaveProperty('resource')
    })
  })

  describe('perspective resolution', () => {
    it('uses explicit perspective from options', () => {
      const {result} = renderHook(() => useNormalizedResourceOptions({perspective: 'published'}))
      expect(result.current.perspective).toBe('published')
    })

    it('falls back to PerspectiveContext when no perspective in options', () => {
      const {result} = renderHook(() => useNormalizedResourceOptions({}), {
        wrapper: ({children}) => (
          <ResourceProvider perspective="previewDrafts" fallback={null}>
            {children}
          </ResourceProvider>
        ),
      })
      expect(result.current.perspective).toBe('previewDrafts')
    })

    it('explicit perspective overrides PerspectiveContext', () => {
      const {result} = renderHook(() => useNormalizedResourceOptions({perspective: 'published'}), {
        wrapper: ({children}) => (
          <ResourceProvider perspective="previewDrafts" fallback={null}>
            {children}
          </ResourceProvider>
        ),
      })
      expect(result.current.perspective).toBe('published')
    })

    it('omits perspective from result when not set', () => {
      const {result} = renderHook(() => useNormalizedResourceOptions({}), {
        wrapper: NoResourceWrapper,
      })
      expect(result.current).not.toHaveProperty('perspective')
    })
  })

  describe('field stripping', () => {
    it('strips resourceName from the result', () => {
      const {result} = renderHook(() => useNormalizedResourceOptions({resourceName: 'dataset'}))
      expect(result.current).not.toHaveProperty('resourceName')
    })

    it('strips projectId and dataset from the result when synthesized into resource', () => {
      const {result} = renderHook(() =>
        useNormalizedResourceOptions({projectId: 'p', dataset: 'd'}),
      )
      expect(result.current).not.toHaveProperty('projectId')
      expect(result.current).not.toHaveProperty('dataset')
    })

    it('strips deprecated source from the result', () => {
      const {result} = renderHook(() =>
        useNormalizedResourceOptions({source: {projectId: 'src', dataset: 'src-ds'}}),
      )
      expect(result.current).not.toHaveProperty('source')
    })

    it('strips deprecated sourceName from the result', () => {
      const {result} = renderHook(() => useNormalizedResourceOptions({sourceName: 'dataset'}))
      expect(result.current).not.toHaveProperty('sourceName')
    })

    it('preserves unrelated fields', () => {
      const opts: DocumentHandle = {documentId: 'doc-1', documentType: 'article'}
      const {result} = renderHook(() => useNormalizedResourceOptions(opts))
      expect(result.current).toMatchObject({documentId: 'doc-1', documentType: 'article'})
    })
  })
})
