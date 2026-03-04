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
    const instance = createSanityInstance()

    const {result} = renderHook(() => useSanityInstance(), {
      wrapper: createWrapper(instance),
    })

    expect(result.current).toBe(instance)
  })

  it('should throw an error if no instance is found in context', () => {
    expect(() => {
      renderHook(() => useSanityInstance(), {
        wrapper: createWrapper(null),
      })
    }).toThrow('SanityInstance context not found')
  })
})
