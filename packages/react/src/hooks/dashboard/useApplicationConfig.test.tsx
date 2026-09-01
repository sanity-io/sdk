import {act, renderHook} from '@testing-library/react'
import {beforeEach, describe, expect, expectTypeOf, it, vi} from 'vitest'

import {createIsolatedMessageBus, type MessageBus} from '../../dashboard/messageBus/bus'
import {type ApplicationConfig} from '../../dashboard/messageBus/topics'
import {type ApplicationConfigSelector, useApplicationConfig} from './useApplicationConfig'
import {type UseTopicResult} from './useTopic'

const mocks = vi.hoisted(() => ({
  client: undefined as MessageBus | undefined,
}))

vi.mock('../../dashboard/messageBus/client', () => ({
  getDashboardMessageBus: () => mocks.client,
}))

const localConfig: ApplicationConfig = {
  appType: 'media-library',
  entry: 'http://localhost:3333',
  moduleId: 'configs/installation_config',
  version: 'local',
}

const applicationConfig: ApplicationConfig = {
  appId: 'application-1',
  appType: 'media-library',
  entry: 'https://application-config.sanity.run',
  moduleId: 'configs/installation_config',
  version: '1',
}

describe('useApplicationConfig', () => {
  beforeEach(() => {
    mocks.client = createIsolatedMessageBus('dashboard')
  })

  it('returns a config by application type or application id', () => {
    const {result, rerender} = renderHook(
      ({selector}: {selector: ApplicationConfigSelector}) =>
        useApplicationConfig(selector, {suspend: false}),
      {initialProps: {selector: {appType: 'media-library'}}},
    )

    expectTypeOf(result.current).toEqualTypeOf<UseTopicResult<ApplicationConfig | null, false>>()

    act(() => mocks.client?.emit('applications.config', [localConfig, applicationConfig]))

    expect(result.current.data).toBe(localConfig)

    rerender({selector: {appId: 'application-1'}})
    expect(result.current.data).toBe(applicationConfig)

    rerender({selector: {appId: 'missing'}})
    expect(result.current).toEqual({data: null, isPending: false})
  })
})
