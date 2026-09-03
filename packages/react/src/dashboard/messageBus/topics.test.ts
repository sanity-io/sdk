import {type Application, type ApplicationInclude} from '@sanity/sdk'
import {describe, expectTypeOf, it} from 'vitest'

import {type MessageBus} from './bus'
import {
  type ApplicationConfig,
  type PayloadOf,
  type ReplyOf,
  type StateTopic,
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

  it('exposes application state values', () => {
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
    const messageBus = {emit: () => undefined} as unknown as MessageBus

    messageBus.emit('auth.token.refresh')
    messageBus.emit('auth.token.refresh', undefined, {timeout: null})
    messageBus.emit('navigation.location.update', {url: '/'})
    // @ts-expect-error navigation.location.update requires a payload
    messageBus.emit('navigation.location.update')
  })
})
