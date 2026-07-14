import {type DocumentResource} from '@sanity/sdk'
import {renderHook} from '@testing-library/react'
import {type ReactNode} from 'react'
import {describe, expect, it} from 'vitest'

import {ResourceContext} from '../../context/DefaultResourceContext'
import {ProjectContext} from '../../context/ProjectContext'
import {useResolvedProjectId} from './useResolvedProjectId'

const datasetResource: DocumentResource = {projectId: 'resource-project', dataset: 'production'}

describe('useResolvedProjectId', () => {
  it('prefers an explicit projectId on the options', () => {
    const {result} = renderHook(() => useResolvedProjectId({projectId: 'option-project'}), {
      wrapper: ({children}: {children: ReactNode}) => (
        <ResourceContext.Provider value={datasetResource}>
          <ProjectContext.Provider value="context-project">{children}</ProjectContext.Provider>
        </ResourceContext.Provider>
      ),
    })
    expect(result.current).toBe('option-project')
  })

  it('falls back to the ambient project scope (ProjectContext) over the resource', () => {
    const {result} = renderHook(() => useResolvedProjectId(), {
      wrapper: ({children}: {children: ReactNode}) => (
        <ResourceContext.Provider value={datasetResource}>
          <ProjectContext.Provider value="context-project">{children}</ProjectContext.Provider>
        </ResourceContext.Provider>
      ),
    })
    expect(result.current).toBe('context-project')
  })

  it('falls back to the resolved resource projectId', () => {
    const {result} = renderHook(() => useResolvedProjectId(), {
      wrapper: ({children}: {children: ReactNode}) => (
        <ResourceContext.Provider value={datasetResource}>{children}</ResourceContext.Provider>
      ),
    })
    expect(result.current).toBe('resource-project')
  })

  it('ignores a non-dataset resource (e.g. media library)', () => {
    const {result} = renderHook(() => useResolvedProjectId(), {
      wrapper: ({children}: {children: ReactNode}) => (
        <ResourceContext.Provider value={{mediaLibraryId: 'ml-id'}}>
          {children}
        </ResourceContext.Provider>
      ),
    })
    expect(result.current).toBeUndefined()
  })

  it('returns undefined when nothing resolves', () => {
    const {result} = renderHook(() => useResolvedProjectId())
    expect(result.current).toBeUndefined()
  })
})
