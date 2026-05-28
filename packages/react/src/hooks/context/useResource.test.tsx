import {renderHook as reactRenderHook} from '@testing-library/react'
import {type ReactNode} from 'react'
import {describe, expect, it} from 'vitest'

import {renderHook} from '../../../test/test-utils'
import {ResourceProvider} from '../../context/ResourceProvider'
import {useResource} from './useResource'

describe('useResource', () => {
  it('returns the resource from the instance config when no explicit resource is set', () => {
    // test-utils wraps with ResourceProvider projectId="test" dataset="test"
    const {result} = renderHook(() => useResource())
    expect(result.current).toEqual({projectId: 'test', dataset: 'test'})
  })

  it('returns the explicit resource when ResourceProvider has a resource prop', () => {
    const resource = {projectId: 'explicit-project', dataset: 'explicit-dataset'}
    const {result} = reactRenderHook(() => useResource(), {
      wrapper: ({children}: {children: ReactNode}) => (
        <ResourceProvider resource={resource} fallback={null}>
          {children}
        </ResourceProvider>
      ),
    })
    expect(result.current).toEqual(resource)
  })

  it('returns undefined when no resource or instance config is available', () => {
    const {result} = reactRenderHook(() => useResource())
    expect(result.current).toBeUndefined()
  })
})
