import {act, renderHook} from '@testing-library/react'
import {beforeEach, describe, expect, expectTypeOf, it, vi} from 'vitest'

import {createIsolatedMessageBus, type MessageBus} from '../../dashboard/messageBus/bus'
import {type ValueOf} from '../../dashboard/messageBus/topics'
import {useApplication} from './useApplication'
import {type Application} from './useApplications'
import {type TopicError, type UseTopicResult} from './useTopic'

const mocks = vi.hoisted(() => ({
  client: undefined as MessageBus | undefined,
}))

vi.mock('../../dashboard/messageBus/client', () => ({
  getDashboardMessageBus: () => mocks.client,
}))

const application = {
  id: 'application-1',
  type: 'coreApp',
  title: 'Inbox',
  name: 'inbox',
  reference: 'sanity/inbox',
  icon: null,
  isSingleton: true,
  visibility: 'default',
  slug: 'inbox',
  externalUrl: null,
  organizationId: 'organization-1',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
}

describe('useApplication', () => {
  beforeEach(() => {
    mocks.client = createIsolatedMessageBus('dashboard')
  })

  it('returns an application by id or null', () => {
    const {result, rerender} = renderHook(
      ({applicationId}) => useApplication(applicationId, {suspend: false}),
      {initialProps: {applicationId: application.id}},
    )

    expectTypeOf(result.current).toEqualTypeOf<
      UseTopicResult<Application | null, false, TopicError>
    >()

    act(() =>
      mocks.client?.emit('applications.list', {
        ok: true,
        value: [application],
      } as ValueOf<'applications.list'>),
    )

    expect(result.current.data?.id).toBe(application.id)

    rerender({applicationId: 'missing'})
    expect(result.current).toEqual({data: null, isPending: false})
  })
})
