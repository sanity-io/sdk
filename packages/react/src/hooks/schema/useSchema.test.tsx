import {createSanityInstance, schema, type SchemaDefinition, type StateSource} from '@sanity/sdk'
import {type FetcherSnapshot} from '@sanity/sdk/_internal'
import {type ReactNode} from 'react'
import {type Observable} from 'rxjs'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {renderHook} from '../../../test/test-utils'
import {ResourceProvider} from '../../context/ResourceProvider'
import {SanityInstanceContext} from '../../context/SanityInstanceContext'
import {useSchema} from './useSchema'

vi.mock('@sanity/sdk', async (importOriginal) => {
  const original = await importOriginal<typeof import('@sanity/sdk')>()
  return {...original, schema: {getState: vi.fn(), resolveState: vi.fn()}}
})

const stateSource = (
  current: SchemaDefinition | undefined,
): StateSource<FetcherSnapshot<SchemaDefinition>> => {
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
  } as unknown as StateSource<FetcherSnapshot<SchemaDefinition>>
}

const definition = {
  _meta: {schemaVersion: 'v1', source: null, sourceLabel: null, producer: 'api'},
  name: 'schema',
  types: [],
} as unknown as SchemaDefinition

const sanityInstance = expect.objectContaining({config: expect.any(Object)})

describe('useSchema', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(schema.getState).mockReturnValue(stateSource(definition))
  })

  it('resolves the dataset resource from the instance config resource', () => {
    // test-utils wraps with ResourceProvider projectId="test" dataset="test".
    renderHook(() => useSchema())
    expect(schema.getState).toHaveBeenCalledWith(
      sanityInstance,
      expect.objectContaining({resource: {projectId: 'test', dataset: 'test'}}),
    )
  })

  it('lets an explicit projectId and dataset override the ambient resource', () => {
    renderHook(() => useSchema({projectId: 'explicit-project', dataset: 'explicit-dataset'}))
    expect(schema.getState).toHaveBeenCalledWith(
      sanityInstance,
      expect.objectContaining({
        resource: {projectId: 'explicit-project', dataset: 'explicit-dataset'},
      }),
    )
  })

  it('resolves the schema from an explicit resource when the config has none', () => {
    renderHook(() => useSchema(), {
      wrapper: ({children}: {children: ReactNode}) => (
        <ResourceProvider
          resource={{projectId: 'resource-project', dataset: 'production'}}
          fallback={null}
        >
          {children}
        </ResourceProvider>
      ),
    })
    expect(schema.getState).toHaveBeenCalledWith(
      sanityInstance,
      expect.objectContaining({resource: {projectId: 'resource-project', dataset: 'production'}}),
    )
  })

  it('resolves an explicit resource option over the ambient resource', () => {
    renderHook(() => useSchema({resource: {projectId: 'option-project', dataset: 'staging'}}))
    expect(schema.getState).toHaveBeenCalledWith(
      sanityInstance,
      expect.objectContaining({resource: {projectId: 'option-project', dataset: 'staging'}}),
    )
  })

  it('suspends via the schema fetcher until schema data is available', () => {
    vi.mocked(schema.getState).mockReturnValue(stateSource(undefined))
    vi.mocked(schema.resolveState).mockReturnValue(new Promise(() => {}))
    renderHook(() => useSchema())
    expect(schema.resolveState).toHaveBeenCalled()
  })

  it('throws for non-dataset resources', () => {
    const mediaInstance = createSanityInstance({resource: {mediaLibraryId: 'ml123'}})
    expect(() =>
      renderHook(() => useSchema(), {
        wrapper: ({children}: {children: ReactNode}) => (
          <SanityInstanceContext.Provider value={mediaInstance}>
            <ResourceProvider resource={{mediaLibraryId: 'ml123'}} fallback={null}>
              {children}
            </ResourceProvider>
          </SanityInstanceContext.Provider>
        ),
      }),
    ).toThrow('The schema API is only available for dataset resources.')
    mediaInstance.dispose()
  })
})
