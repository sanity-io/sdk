import {createSanityInstance, type Project, project, type StateSource} from '@sanity/sdk'
import {type FetcherSnapshot} from '@sanity/sdk/_internal'
import {type ReactNode} from 'react'
import {type Observable} from 'rxjs'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {renderHook} from '../../../test/test-utils'
import {ResourceProvider} from '../../context/ResourceProvider'
import {SanityInstanceContext} from '../../context/SanityInstanceContext'
import {useProject} from './useProject'

vi.mock('@sanity/sdk', async (importOriginal) => {
  const original = await importOriginal<typeof import('@sanity/sdk')>()
  return {...original, project: {getState: vi.fn(), resolveState: vi.fn()}}
})

const stateSource = (current: Project | undefined): StateSource<FetcherSnapshot<Project>> => {
  // Cache the snapshot: useSyncExternalStore requires a referentially stable current value.
  const snapshot = current
    ? {status: 'success', data: current, error: undefined, isFetching: false, dataUpdatedAt: 1}
    : {
        status: 'pending',
        data: undefined,
        error: undefined,
        isFetching: true,
        dataUpdatedAt: undefined,
      }
  return {
    getCurrent: vi.fn(() => snapshot),
    subscribe: vi.fn(() => () => {}),
    get observable(): Observable<unknown> {
      throw new Error('Not implemented')
    },
  } as unknown as StateSource<FetcherSnapshot<Project>>
}

const sanityInstance = expect.objectContaining({config: expect.any(Object)})

describe('useProject', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(project.getState).mockReturnValue(stateSource({id: 'p'} as unknown as Project))
  })

  it('resolves the projectId from the instance config resource', () => {
    // test-utils wraps with ResourceProvider projectId="test" dataset="test".
    renderHook(() => useProject())
    expect(project.getState).toHaveBeenCalledWith(
      sanityInstance,
      expect.objectContaining({projectId: 'test'}),
    )
  })

  it('lets an explicit projectId override the ambient resource', () => {
    renderHook(() => useProject({projectId: 'explicit-project'}))
    expect(project.getState).toHaveBeenCalledWith(
      sanityInstance,
      expect.objectContaining({projectId: 'explicit-project'}),
    )
  })

  it('resolves the projectId from an explicit resource when the config has none', () => {
    renderHook(() => useProject(), {
      wrapper: ({children}: {children: ReactNode}) => (
        <ResourceProvider
          resource={{projectId: 'resource-project', dataset: 'production'}}
          fallback={null}
        >
          {children}
        </ResourceProvider>
      ),
    })
    expect(project.getState).toHaveBeenCalledWith(
      sanityInstance,
      expect.objectContaining({projectId: 'resource-project'}),
    )
  })

  it('resolves a dataset-less projectId config for project-scoped use', () => {
    renderHook(() => useProject(), {
      wrapper: ({children}: {children: ReactNode}) => (
        <ResourceProvider projectId="config-project" fallback={null}>
          {children}
        </ResourceProvider>
      ),
    })
    // A dataset-less config can't form a DatasetResource; the projectId is carried
    // via ProjectContext and injected so project-scoped reads still resolve it.
    expect(project.getState).toHaveBeenCalledWith(
      sanityInstance,
      expect.objectContaining({projectId: 'config-project'}),
    )
  })

  it('resolves a bare projectId from a ResourceProvider when the parent instance has no config', () => {
    // An instance with no project/dataset config and no ambient
    // resource, then a projectId-only ResourceProvider.
    const emptyInstance = createSanityInstance({})
    renderHook(() => useProject(), {
      wrapper: ({children}: {children: ReactNode}) => (
        <SanityInstanceContext.Provider value={emptyInstance}>
          <ResourceProvider projectId="bare-project" fallback={null}>
            {children}
          </ResourceProvider>
        </SanityInstanceContext.Provider>
      ),
    })
    expect(project.getState).toHaveBeenCalledWith(
      emptyInstance,
      expect.objectContaining({projectId: 'bare-project'}),
    )
  })

  it('suspends via the project fetcher until project data is available', () => {
    vi.mocked(project.getState).mockReturnValue(stateSource(undefined))
    vi.mocked(project.resolveState).mockReturnValue(new Promise(() => {}))
    renderHook(() => useProject())
    expect(project.resolveState).toHaveBeenCalled()
  })
})
