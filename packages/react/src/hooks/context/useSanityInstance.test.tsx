import {createSanityInstance} from '@sanity/sdk'
import {renderHook} from '@testing-library/react'
import React from 'react'
import {describe, expect, it, vi} from 'vitest'

import {SanityProvider} from '../../components/context/SanityProvider'
import {useSanityInstance} from './useSanityInstance'

describe('useSanityInstance', () => {
  const sanityInstance = createSanityInstance({projectId: 'test-project', dataset: 'production'})

  it('returns sanity instance when used within provider', () => {
    const wrapper = ({children}: {children: React.ReactNode}) => (
      <SanityProvider sanityInstance={sanityInstance}>{children}</SanityProvider>
    )

    const {result} = renderHook(() => useSanityInstance(), {wrapper})

    expect(result.current).toBe(sanityInstance)
  })

  it('throws error when used outside provider', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => {
      renderHook(() => useSanityInstance())
    }).toThrow('useSanityInstance must be called from within the SanityProvider')

    consoleSpy.mockRestore()
  })
})
