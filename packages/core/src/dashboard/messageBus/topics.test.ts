import {describe, expect, expectTypeOf, it} from 'vitest'

import {type Application, type ApplicationInclude} from '../../applications/applications'
import {type MessageBus} from './bus'
import {
  type ApplicationConfig,
  type ApplicationConfigAppType,
  type ApplicationStatusUpdate,
  DASHBOARD_TOPIC_MANIFEST,
  type PayloadOf,
  type ReplyOf,
  type StateTopic,
  type TopicName,
  type TopicResult,
  type ValueOf,
} from './topics'

type IsStateTopic<Topic> = Topic extends StateTopic ? true : false
type ListedApplication = Extract<
  NonNullable<ValueOf<'applications.list'>>,
  {ok: true}
>['value'][number]
type ListedInterface = NonNullable<
  NonNullable<ListedApplication['activeDeployment']>['interfaces']
>[number]

describe('dashboard topic types', () => {
  it('distinguishes state and event topics', () => {
    expectTypeOf<IsStateTopic<'applications.foreground'>>().toEqualTypeOf<true>()
    expectTypeOf<IsStateTopic<'auth.token.refresh'>>().toEqualTypeOf<false>()
    expectTypeOf<Parameters<MessageBus['query']>[0]>().toEqualTypeOf<StateTopic>()
  })

  it('keeps application status internal', () => {
    expectTypeOf<ApplicationStatusUpdate>().toEqualTypeOf<{
      name: string
      value: {label: string | null}
    }>()
    expect(DASHBOARD_TOPIC_MANIFEST['applications.status.update']).toEqual({
      kind: 'event',
      ownership: {type: 'same_app'},
    })
    expectTypeOf<'applications.status.update'>().not.toMatchTypeOf<TopicName>()
  })

  it('exposes application state values', () => {
    expectTypeOf<ValueOf<'applications.base-path'>>().toEqualTypeOf<TopicResult<string>>()
    expectTypeOf<ValueOf<'applications.config'>>().toEqualTypeOf<ApplicationConfig[] | null>()
    expectTypeOf<ValueOf<'applications.list'>>().toEqualTypeOf<TopicResult<
      Application<ApplicationInclude>[]
    > | null>()
    expectTypeOf<Extract<ListedInterface, {type: 'tile'}>['metadata']>().toEqualTypeOf<{
      order?: number
      size: 'small' | 'large' | 'banner'
    }>()
    expectTypeOf<Extract<ListedInterface, {type: 'panel'}>['metadata']>().toEqualTypeOf<{
      dock?: {group?: string; order?: number}
    } | null>()
    expectTypeOf<ValueOf<'applications.foreground'>>().toEqualTypeOf<Application['id'] | null>()
  })

  it('keeps appType open for forward compatibility without collapsing to string', () => {
    expectTypeOf<'media-library'>().toMatchTypeOf<ApplicationConfigAppType>()
    // Guards the `& {}` trick: a plain `string` here would drop known-value autocomplete.
    expectTypeOf<ApplicationConfigAppType>().not.toEqualTypeOf<string>()
  })

  it('exposes event payload and reply values', () => {
    expectTypeOf<PayloadOf<'navigation.location.update'>>().toEqualTypeOf<{
      url: string
      history?: 'push' | 'replace'
    }>()
    expectTypeOf<ReplyOf<'navigation.location.update'>>().toEqualTypeOf<
      {ok: true} | {ok: false; reason: 'not-navigable' | 'interrupted' | 'failed'}
    >()
  })

  it('requires payloads only for events that declare one', () => {
    const messageBus = {
      emit: () => undefined,
      query: () => undefined,
      subscribe: () => undefined,
    } as unknown as MessageBus

    messageBus.emit('auth.token.refresh')
    messageBus.emit('auth.token.refresh', undefined, {timeout: null})
    messageBus.emit('navigation.location.update', {url: '/'})
    // @ts-expect-error navigation.location.update requires a payload
    messageBus.emit('navigation.location.update')
    // @ts-expect-error applications.status.update is internal
    messageBus.emit('applications.status.update', {name: 'media', value: {label: null}})
    // @ts-expect-error applications.status.update is internal
    messageBus.query('applications.status.update')
    // @ts-expect-error applications.status.update is internal
    messageBus.subscribe('applications.status.update')
    // @ts-expect-error applications.status.update is internal
    messageBus.subscribe('applications.status.update', () => {})
  })
})
