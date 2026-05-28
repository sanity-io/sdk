import {createSanityInstance, type SanityConfig, type SanityInstance} from '@sanity/sdk'
import {renderHook} from '@testing-library/react'
import {type ReactNode} from 'react'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

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
    let warnSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
      warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    })

    afterEach(() => {
      warnSpy.mockRestore()
    })

    it('should return the current context instance regardless of config', () => {
      const instance = createSanityInstance({projectId: 'test-project', dataset: 'test-dataset'})
      const requestedConfig: SanityConfig = {projectId: 'test-project', dataset: 'test-dataset'}

      const {result} = renderHook(() => useSanityInstance(requestedConfig), {
        wrapper: createWrapper(instance),
      })

      expect(result.current).toBe(instance)
    })

    it('should throw if no instance in context even when config is provided', () => {
      expect(() => {
        renderHook(() => useSanityInstance({projectId: 'test'}), {
          wrapper: createWrapper(null),
        })
      }).toThrow('SanityInstance context not found')
    })

    it('warns once when a config argument is passed', () => {
      const instance = createSanityInstance({projectId: 'test-project', dataset: 'test-dataset'})
      const {rerender} = renderHook(() => useSanityInstance({projectId: 'test-project'}), {
        wrapper: createWrapper(instance),
      })

      expect(warnSpy).toHaveBeenCalledTimes(1)
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[useSanityInstance]'))

      rerender()
      rerender()
      expect(warnSpy).toHaveBeenCalledTimes(1)
    })

    it('does not warn when no config is passed', () => {
      const instance = createSanityInstance({projectId: 'test-project', dataset: 'test-dataset'})
      renderHook(() => useSanityInstance(), {wrapper: createWrapper(instance)})

      expect(warnSpy).not.toHaveBeenCalled()
    })
  })
})
