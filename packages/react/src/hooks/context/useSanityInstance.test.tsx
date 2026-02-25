import {createSanityInstance, type SanityInstance} from '@sanity/sdk'
import {renderHook} from '@testing-library/react'
import {type ReactNode} from 'react'
import {describe, expect, it} from 'vitest'

import {SanityInstanceContext} from '../../context/SanityInstanceContext'
import {useSanityInstance} from './useSanityInstance'

describe('useSanityInstance', () => {
  function createWrapper(instance: SanityInstance | null) {
    return function Wrapper({children}: {children: ReactNode}) {
      return (
        <SanityInstanceContext.Provider value={instance}>{children}</SanityInstanceContext.Provider>
      )
    }
  }

  it('should return the Sanity instance from context', () => {
    // Create a Sanity instance
    const instance = createSanityInstance({
      sources: {default: {projectId: 'test-project', dataset: 'test-dataset'}},
    })

    // Render the hook with the wrapper that provides the context
    const {result} = renderHook(() => useSanityInstance(), {
      wrapper: createWrapper(instance),
    })

    // Check that the correct instance is returned
    expect(result.current).toBe(instance)
  })

  it('should throw an error if no instance is found in context', () => {
    // Expect the hook to throw when no instance is in context
    expect(() => {
      renderHook(() => useSanityInstance(), {
        wrapper: createWrapper(null),
      })
    }).toThrow('SanityInstance context not found')
  })

  it('should include the requested config in error message when no instance found', () => {
    const requestedConfig = {sources: {default: {projectId: 'test', dataset: 'test'}}}

    // Expect the hook to throw and include the requested config in the error
    expect(() => {
      renderHook(() => useSanityInstance(requestedConfig), {
        wrapper: createWrapper(null),
      })
    }).toThrow(JSON.stringify(requestedConfig, null, 2))
  })

  it('should return the current instance when no config is provided', () => {
    const instance = createSanityInstance({
      sources: {default: {projectId: 'test-project', dataset: 'test-dataset'}},
    })

    const {result} = renderHook(() => useSanityInstance(), {
      wrapper: createWrapper(instance),
    })

    expect(result.current).toBe(instance)
  })

  it('should return current instance when provided config matches', () => {
    const instance = createSanityInstance({
      sources: {default: {projectId: 'test-project', dataset: 'test-dataset'}},
    })

    const {result} = renderHook(
      () =>
        useSanityInstance({
          sources: {default: {projectId: 'test-project', dataset: 'test-dataset'}},
        }),
      {
        wrapper: createWrapper(instance),
      },
    )

    expect(result.current).toBe(instance)
  })

  it('should support matching by partial config', () => {
    const instance = createSanityInstance({
      sources: {default: {projectId: 'test-project', dataset: 'test-dataset'}},
      auth: {apiHost: 'api.sanity.test'},
    })

    const {result} = renderHook(
      () =>
        useSanityInstance({
          auth: {apiHost: 'api.sanity.test'},
        }),
      {
        wrapper: createWrapper(instance),
      },
    )

    expect(result.current).toBe(instance)
  })

  it('should ignore non-SanityConfig fields when matching', () => {
    const instance = createSanityInstance({
      sources: {default: {projectId: 'test-project', dataset: 'test-dataset'}},
    })

    const request = {
      source: {projectId: 'ppsg7ml5', dataset: 'test'},
    } as unknown as Parameters<typeof useSanityInstance>[0]

    const {result} = renderHook(() => useSanityInstance(request), {
      wrapper: createWrapper(instance),
    })

    expect(result.current).toBe(instance)
  })

  it('should throw an error if current instance does not match provided config', () => {
    const instance = createSanityInstance({
      sources: {default: {projectId: 'test-project', dataset: 'test-dataset'}},
    })

    expect(() => {
      renderHook(
        () =>
          useSanityInstance({
            sources: {default: {projectId: 'non-existent', dataset: 'not-found'}},
          }),
        {wrapper: createWrapper(instance)},
      )
    }).toThrow('Current Sanity instance does not match the requested configuration')
  })

  it('should include requested config in mismatch error message', () => {
    const instance = createSanityInstance({
      sources: {default: {projectId: 'test-project', dataset: 'test-dataset'}},
    })
    const requestedConfig = {sources: {default: {projectId: 'different', dataset: 'different'}}}

    expect(() => {
      renderHook(() => useSanityInstance(requestedConfig), {
        wrapper: createWrapper(instance),
      })
    }).toThrow(JSON.stringify(requestedConfig, null, 2))
  })

  it('should not fall back to parent when current instance does not match', () => {
    const parent = createSanityInstance({
      sources: {default: {projectId: 'parent', dataset: 'production'}},
    })
    const child = parent.createChild({
      sources: {default: {projectId: 'child', dataset: 'production'}},
    })

    expect(() => {
      renderHook(
        () =>
          useSanityInstance({
            sources: {default: {projectId: 'parent', dataset: 'production'}},
          }),
        {
          wrapper: createWrapper(child),
        },
      )
    }).toThrow('Current Sanity instance does not match the requested configuration')
  })

  it('should match child instance when current instance config matches', () => {
    const parent = createSanityInstance({
      sources: {default: {projectId: 'parent', dataset: 'production'}},
    })
    const child = parent.createChild({
      sources: {default: {projectId: 'child', dataset: 'production'}},
    })

    const {result} = renderHook(
      () =>
        useSanityInstance({
          sources: {default: {projectId: 'child', dataset: 'production'}},
        }),
      {
        wrapper: createWrapper(child),
      },
    )

    expect(result.current).toBe(child)
  })
})
