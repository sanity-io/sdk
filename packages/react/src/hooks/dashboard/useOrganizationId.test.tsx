import {getDashboardOrganizationId} from '@sanity/sdk'
import {installMessageBus, resetMessageBus} from '@sanity/sdk/_internal'
import {type MessageBusHost} from '@sanity/sdk/dashboard'
import {renderHook} from '@testing-library/react'
import {throwError} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {act} from '../../../test/test-utils'
import {ResourceProvider} from '../../context/ResourceProvider'
import {useOrganizationId} from './useOrganizationId'

vi.mock('@sanity/sdk', async (importOriginal) => {
  const actual = await importOriginal()
  return {...(actual || {}), getDashboardOrganizationId: vi.fn()}
})

const MESSAGE_BUS_KEY = Symbol.for('sanity.os.bus')

describe('useOrganizationId', () => {
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
})

describe('useOrganizationId (message bus)', () => {
  let host: MessageBusHost

  beforeEach(() => {
    vi.stubGlobal('__SANITY_APP_ID__', 'app')
    host = installMessageBus({appId: 'dashboard'})
  })

  afterEach(() => {
    resetMessageBus()
    delete (globalThis as {[MESSAGE_BUS_KEY]?: unknown})[MESSAGE_BUS_KEY]
    vi.unstubAllGlobals()
  })

  const wrapper = ({children}: {children: React.ReactNode}) => (
    <ResourceProvider projectId="test-project" dataset="test-dataset" fallback={null}>
      {children}
    </ResourceProvider>
  )

  it('is undefined before the host publishes the current organization', () => {
    const {result} = renderHook(() => useOrganizationId(), {wrapper})
    expect(result.current).toBeUndefined()
  })

  it('returns the organization id once the host publishes it', () => {
    const {result} = renderHook(() => useOrganizationId(), {wrapper})

    act(() =>
      host.connections.subscribe((client) =>
        client.emit('organizations.current', {id: 'org_123', name: 'Org', slug: 'org'}),
      ),
    )

    expect(result.current).toBe('org_123')
  })

  it('is undefined when the host publishes no active organization', () => {
    const {result} = renderHook(() => useOrganizationId(), {wrapper})

    act(() => host.connections.subscribe((client) => client.emit('organizations.current', null)))

    expect(result.current).toBeUndefined()
  })
})
