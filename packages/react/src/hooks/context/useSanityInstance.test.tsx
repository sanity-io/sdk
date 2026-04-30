import {createSanityInstance, type SanityConfig, type SanityInstance} from '@sanity/sdk'
import {renderHook} from '@testing-library/react'
import {type ReactNode} from 'react'
import {describe, expect, it, vi} from 'vitest'

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

  it('should return the current instance when no config is provided', () => {
    // Create a Sanity instance
    const instance = createSanityInstance({projectId: 'gp', dataset: 'gp-ds'})

    // Render the hook with the wrapper that provides the context
    const {result} = renderHook(() => useSanityInstance(), {
      wrapper: createWrapper(instance),
    })

    // Should return the instance
    expect(result.current).toBe(instance)
  })

  describe('deprecated config parameter', () => {
    it('should return the current context instance regardless of config', () => {
      const instance = createSanityInstance({projectId: 'test-project', dataset: 'test-dataset'})
      const requestedConfig: SanityConfig = {projectId: 'test-project', dataset: 'test-dataset'}

      const {result} = renderHook(() => useSanityInstance(requestedConfig), {
        wrapper: createWrapper(instance),
      })

      expect(result.current).toBe(instance)
    })

    it('should warn when config is provided', () => {
      const instance = createSanityInstance({projectId: 'test-project', dataset: 'test-dataset'})
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

      renderHook(() => useSanityInstance({projectId: 'test-project'}), {
        wrapper: createWrapper(instance),
      })

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('deprecated'))
      consoleSpy.mockRestore()
    })

    it('should not warn when no config is provided', () => {
      const instance = createSanityInstance({projectId: 'test-project', dataset: 'test-dataset'})
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

      renderHook(() => useSanityInstance(), {
        wrapper: createWrapper(instance),
      })

      expect(consoleSpy).not.toHaveBeenCalled()
      consoleSpy.mockRestore()
    })

    it('should throw if no instance in context even when config is provided', () => {
      expect(() => {
        renderHook(() => useSanityInstance({projectId: 'test'}), {
          wrapper: createWrapper(null),
        })
      }).toThrow('SanityInstance context not found')
    })
  })
})
