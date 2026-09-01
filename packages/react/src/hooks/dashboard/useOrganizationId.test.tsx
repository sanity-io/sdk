import {getDashboardOrganizationId, getIsInDashboardState, type StateSource} from '@sanity/sdk'
import {act, renderHook} from '@testing-library/react'
import {of, throwError} from 'rxjs'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {ResourceProvider} from '../../context/ResourceProvider'
import {createIsolatedMessageBus, type MessageBus} from '../../dashboard/messageBus/bus'
import {useOrganizationId} from './useOrganizationId'

const mocks = vi.hoisted(() => ({
  messageBus: undefined as MessageBus | undefined,
}))

vi.mock('@sanity/sdk', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...(actual || {}),
    getDashboardOrganizationId: vi.fn(),
    getIsInDashboardState: vi.fn(),
  }
})

vi.mock('../../dashboard/messageBus/client', () => ({
  getDashboardMessageBus: () => mocks.messageBus,
}))

const dashboardContextState = (value: boolean): StateSource<boolean> => ({
  getCurrent: () => value,
  observable: of(value),
  subscribe: () => () => {},
})

describe('useOrganizationId', () => {
  beforeEach(() => {
    mocks.messageBus = undefined
    vi.mocked(getIsInDashboardState).mockReturnValue(dashboardContextState(false))
    vi.mocked(getDashboardOrganizationId).mockReturnValue({
      getCurrent: () => undefined,
      subscribe: () => () => {},
      observable: throwError(() => new Error('Unexpected usage of observable')),
    })
  })

  it('should return undefined when no organization ID is set', () => {
    const subscribe = vi.fn()
    vi.mocked(getDashboardOrganizationId).mockReturnValue({
      getCurrent: () => undefined,
      subscribe,
      observable: throwError(() => new Error('Unexpected usage of observable')),
    })

    const {result} = renderHook(() => useOrganizationId(), {
      wrapper: ({children}) => (
        <ResourceProvider projectId="test-project" dataset="test-dataset" fallback={null}>
          {children}
        </ResourceProvider>
      ),
    })
    expect(result.current).toBeUndefined()
  })

  it('should return organization ID when one is set', () => {
    const subscribe = vi.fn()
    const mockOrgId = 'team_123'
    vi.mocked(getDashboardOrganizationId).mockReturnValue({
      getCurrent: () => mockOrgId,
      subscribe,
      observable: throwError(() => new Error('Unexpected usage of observable')),
    })

    const {result} = renderHook(() => useOrganizationId(), {
      wrapper: ({children}) => (
        <ResourceProvider projectId="test-project" dataset="test-dataset" fallback={null}>
          {children}
        </ResourceProvider>
      ),
    })
    expect(result.current).toBe(mockOrgId)
  })

  it('reads and follows the current message bus organization', () => {
    mocks.messageBus = createIsolatedMessageBus('application')
    act(() =>
      mocks.messageBus?.emit('organizations.current', {
        id: 'organization-1',
        name: 'Organization',
        slug: 'organization',
      }),
    )

    const {result} = renderHook(() => useOrganizationId(), {
      wrapper: ({children}) => (
        <ResourceProvider projectId="test-project" dataset="test-dataset" fallback={null}>
          {children}
        </ResourceProvider>
      ),
    })

    expect(result.current).toBe('organization-1')

    act(() => mocks.messageBus?.emit('organizations.current', null))
    expect(result.current).toBeUndefined()
  })
})
