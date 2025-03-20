import {createSanityInstance, type SanityConfig, type SanityInstance} from '@sanity/sdk'
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
    const instance = createSanityInstance({projectId: 'test-project', dataset: 'test-dataset'})

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
    const requestedConfig = {projectId: 'test', dataset: 'test'}

    // Expect the hook to throw and include the requested config in the error
    expect(() => {
      renderHook(() => useSanityInstance(requestedConfig), {
        wrapper: createWrapper(null),
      })
    }).toThrow(JSON.stringify(requestedConfig, null, 2))
  })

  it('should find a matching instance with provided config', () => {
    // Create a parent instance
    const parentInstance = createSanityInstance({
      projectId: 'parent-project',
      dataset: 'parent-dataset',
    })

    // Create a child instance
    const childInstance = parentInstance.createChild({dataset: 'child-dataset'})

    // Render the hook with the child instance and request the parent config
    const {result} = renderHook(
      () => useSanityInstance({projectId: 'parent-project', dataset: 'parent-dataset'}),
      {wrapper: createWrapper(childInstance)},
    )

    // Should match and return the parent instance
    expect(result.current).toBe(parentInstance)
  })

  it('should throw an error if no matching instance is found for config', () => {
    // Create an instance
    const instance = createSanityInstance({projectId: 'test-project', dataset: 'test-dataset'})

    // Request a config that doesn't match
    const requestedConfig: SanityConfig = {
      projectId: 'non-existent',
      dataset: 'not-found',
    }

    // Expect the hook to throw for a non-matching config
    expect(() => {
      renderHook(() => useSanityInstance(requestedConfig), {
        wrapper: createWrapper(instance),
      })
    }).toThrow('Could not find a matching Sanity instance')
  })

  it('should include the requested config in error message when no matching instance', () => {
    const instance = createSanityInstance({projectId: 'test-project', dataset: 'test-dataset'})
    const requestedConfig = {projectId: 'different', dataset: 'different'}

    // Expect the error to include the requested config details
    expect(() => {
      renderHook(() => useSanityInstance(requestedConfig), {
        wrapper: createWrapper(instance),
      })
    }).toThrow(JSON.stringify(requestedConfig, null, 2))
  })

  it('should return the current instance when no config is provided', () => {
    // Create a hierarchy of instances
    const grandparent = createSanityInstance({projectId: 'gp', dataset: 'gp-ds'})
    const parent = grandparent.createChild({projectId: 'p'})
    const child = parent.createChild({dataset: 'child-ds'})

    // Render the hook with the child instance and no config
    const {result} = renderHook(() => useSanityInstance(), {
      wrapper: createWrapper(child),
    })

    // Should return the child instance
    expect(result.current).toBe(child)
  })

  it('should match child instance when it satisfies the config', () => {
    // Create a parent instance
    const parent = createSanityInstance({projectId: 'parent', dataset: 'parent-ds'})

    // Create a child instance that inherits projectId
    const child = parent.createChild({dataset: 'child-ds'})

    // Render the hook with the child instance and request by the child's dataset
    const {result} = renderHook(() => useSanityInstance({dataset: 'child-ds'}), {
      wrapper: createWrapper(child),
    })

    // Should match and return the child instance
    expect(result.current).toBe(child)
  })

  it('should match partial config correctly', () => {
    // Create an instance with multiple config values
    const instance = createSanityInstance({
      projectId: 'test-proj',
      dataset: 'test-ds',
    })

    // Should match when requesting just one property
    const {result} = renderHook(() => useSanityInstance({dataset: 'test-ds'}), {
      wrapper: createWrapper(instance),
    })

    expect(result.current).toBe(instance)
  })

  it("should match deeper in hierarchy when current instance doesn't match", () => {
    // Create a three-level hierarchy
    const root = createSanityInstance({projectId: 'root', dataset: 'root-ds'})
    const middle = root.createChild({projectId: 'middle'})
    const leaf = middle.createChild({dataset: 'leaf-ds'})

    // Request config matching the root from the leaf
    const {result} = renderHook(() => useSanityInstance({projectId: 'root', dataset: 'root-ds'}), {
      wrapper: createWrapper(leaf),
    })

    // Should find and return the root instance
    expect(result.current).toBe(root)
  })

  it('should match undefined values in config', () => {
    // Create instance with only projectId
    const rootInstance = createSanityInstance({projectId: 'test'})

    // Match specifically looking for undefined dataset
    const {result} = renderHook(() => useSanityInstance({dataset: undefined}), {
      wrapper: createWrapper(rootInstance),
    })

    expect(result.current).toBe(rootInstance)
  })
})
