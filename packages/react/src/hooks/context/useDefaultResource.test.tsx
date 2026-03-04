import {renderHook} from '@testing-library/react'
import {describe, expect, it} from 'vitest'

import {ResourceContext} from '../../context/DefaultResourceContext'
import {useResource} from './useDefaultResource'

describe('useResource', () => {
  it('returns the resource from context', () => {
    const resource = {projectId: 'my-project', dataset: 'my-dataset'}

    const {result} = renderHook(() => useResource(), {
      wrapper: ({children}) => (
        <ResourceContext.Provider value={resource}>{children}</ResourceContext.Provider>
      ),
    })

    expect(result.current).toBe(resource)
  })

  it('returns undefined when no resource is in context', () => {
    const {result} = renderHook(() => useResource())

    expect(result.current).toBeUndefined()
  })
})
