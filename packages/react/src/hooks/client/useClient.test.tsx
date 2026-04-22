import {renderHook} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'

import {ResourceProvider} from '../../context/ResourceProvider'
import {useClient} from './useClient'

describe('useClient', () => {
  const wrapper = ({children}: {children: React.ReactNode}) => (
    <ResourceProvider
      resource={{projectId: 'test-project', dataset: 'test-dataset'}}
      fallback={null}
    >
      {children}
    </ResourceProvider>
  )

  it('should throw a helpful error when called without options', () => {
    // Suppress console.error for this test since we expect an error to be thrown
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => {
      // @ts-expect-error Testing missing options
      renderHook(() => useClient(), {wrapper})
    }).toThrowError(/requires a configuration object with at least an "apiVersion" property/)

    consoleErrorSpy.mockRestore()
  })

  it('should throw a helpful error when called with undefined', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => {
      // @ts-expect-error Testing undefined options
      renderHook(() => useClient(undefined), {wrapper})
    }).toThrowError(/requires a configuration object with at least an "apiVersion" property/)

    consoleErrorSpy.mockRestore()
  })

  it('should return a client when called with valid options', () => {
    const {result} = renderHook(() => useClient({apiVersion: '2024-11-12'}), {wrapper})
    expect(result.current).toBeDefined()
    expect(result.current.fetch).toBeDefined()
  })

  it('should conform to the context resource when only apiVersion is provided', () => {
    const {result} = renderHook(() => useClient({apiVersion: '2024-11-12'}), {wrapper})
    expect(result.current.config()).toEqual(
      expect.objectContaining({
        apiVersion: '2024-11-12',
        resource: {type: 'dataset', id: 'test-project.test-dataset'},
      }),
    )
    expect(result.current.config()).not.toHaveProperty('projectId')
    expect(result.current.config()).not.toHaveProperty('dataset')
  })

  it('should use explicit projectId and dataset instead of conforming to the context resource', () => {
    const {result} = renderHook(
      () =>
        useClient({
          apiVersion: '2024-11-12',
          projectId: 'explicit-project',
          dataset: 'explicit-dataset',
        }),
      {wrapper},
    )
    expect(result.current.config()).toEqual(
      expect.objectContaining({
        apiVersion: '2024-11-12',
        projectId: 'explicit-project',
        dataset: 'explicit-dataset',
        useProjectHostname: true,
      }),
    )
  })
})
