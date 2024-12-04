import {renderHook} from '@testing-library/react'
import React from 'react'
import {describe, expect, it, vi} from 'vitest'
import {createSanityInstance} from '@sanity/sdk'
import {SanityProvider} from '../../components/context/SanityProvider'
import {useSanityInstance} from './useSanityInstance'

vi.mock('@sanity/sdk', () => ({
  createSanityInstance: vi.fn(() => ({
    mockInstance: true,
  })),
}))

describe('useSanityInstance', () => {
  const config = {projectId: 'test-project', dataset: 'production'}

  it('returns sanity instance when used within provider', () => {
    const wrapper = ({children}: {children: React.ReactNode}) => (
      <SanityProvider config={config}>{children}</SanityProvider>
    )

    const {result} = renderHook(() => useSanityInstance(), {wrapper})

    expect(result.current).toEqual({mockInstance: true})
    expect(createSanityInstance).toHaveBeenCalledWith(config)
  })

  it('throws error when used outside provider', () => {
    expect(() => {
      renderHook(() => useSanityInstance())
    }).toThrow('useSanityInstance must be called from within the SanityProvider')
  })
})
