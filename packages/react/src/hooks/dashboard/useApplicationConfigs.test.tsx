import {act, renderHook} from '@testing-library/react'
import {beforeEach, describe, expect, expectTypeOf, it, vi} from 'vitest'

import {createIsolatedMessageBus, type MessageBus} from '../../dashboard/messageBus/bus'
import {type ApplicationConfig} from '../../dashboard/messageBus/topics'
import {useApplicationConfigs} from './useApplicationConfigs'
import {type UseTopicResult} from './useTopic'

const mocks = vi.hoisted(() => ({
  client: undefined as MessageBus | undefined,
}))

vi.mock('../../dashboard/messageBus/client', () => ({
  getDashboardMessageBus: () => mocks.client,
}))

const configs: ApplicationConfig[] = [
  {
    appType: 'media-libraries',
    entry: 'https://media-library-config.sanity.run',
    moduleId: 'configs/installation_config',
    version: '1',
  },
  {
    appId: 'application-1',
    appType: 'media-libraries',
    entry: 'https://application-config.sanity.run',
    moduleId: 'configs/installation_config',
    version: '2',
  },
]

describe('useApplicationConfigs', () => {
  beforeEach(() => {
    mocks.client = createIsolatedMessageBus('dashboard')
  })

  it('returns every published application config', () => {
    const {result} = renderHook(() => useApplicationConfigs({suspend: false}))

    expectTypeOf(result.current).toEqualTypeOf<UseTopicResult<ApplicationConfig[], false>>()
    expect(result.current).toEqual({data: undefined, isPending: true})

    act(() => mocks.client?.emit('applications.config', configs))

    expect(result.current).toEqual({data: configs, isPending: false})
  })

  it('returns an empty list when the dashboard clears its configs', () => {
    mocks.client?.emit('applications.config', null)

    const {result} = renderHook(() => useApplicationConfigs({suspend: false}))

    expect(result.current).toEqual({data: [], isPending: false})
  })
})
