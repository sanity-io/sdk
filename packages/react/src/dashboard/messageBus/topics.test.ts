import {type Application, type ApplicationInclude} from '@sanity/sdk'
import {describe, expectTypeOf, it} from 'vitest'

import {type Bus, type EmitResult} from './bus'
import {type StateTopic, type TopicResult, type ValueOf} from './topics'

type IsStateTopic<K> = K extends StateTopic ? true : false

describe('topic types', () => {
  it('recognizes declared state topics', () => {
    expectTypeOf<IsStateTopic<'test.count'>>().toEqualTypeOf<true>()
  })

  it("constrains query's argument to the state-topic union", () => {
    type QueryArg = Parameters<Bus['query']>[0]
    expectTypeOf<IsStateTopic<QueryArg>>().toEqualTypeOf<true>()
  })

  it('treats event topics as non-state, so query rejects them', () => {
    expectTypeOf<IsStateTopic<'test.echo'>>().toEqualTypeOf<false>()
    expectTypeOf<IsStateTopic<'test.ping'>>().toEqualTypeOf<false>()
  })
})

describe("emit's payload argument", () => {
  // A callable stub: the assertions below are type-level, but the `emit(...)`
  // argument still evaluates at runtime, so it must be an actual function.
  const bus = {emit: () => undefined} as unknown as Bus

  it('takes no payload for a void-payload event topic', () => {
    // Each call type-checks only because the payload is optional; the return
    // type doubles as a check that the reply still flows through.
    expectTypeOf(bus.emit('test.mint')).toEqualTypeOf<EmitResult<string>>()
    expectTypeOf(bus.emit('test.mint', undefined)).toEqualTypeOf<EmitResult<string>>()
    expectTypeOf(bus.emit('test.mint', undefined, {timeout: null})).toEqualTypeOf<
      EmitResult<string>
    >()
  })

  it('still requires the payload for a non-void event topic', () => {
    expectTypeOf(bus.emit('test.ping', {n: 1})).toEqualTypeOf<EmitResult<never>>()
    // Omitting the payload is a type error — the topic isn't in emit's
    // void-payload branch, so the tuple keeps `payload` required.
    // @ts-expect-error payload is required for a non-void topic
    bus.emit('test.ping')
  })
})

describe('application topics', () => {
  it('carries brett-shaped records', () => {
    expectTypeOf<ValueOf<'applications.list'>>().toEqualTypeOf<TopicResult<
      Application<ApplicationInclude>[]
    > | null>()
  })

  it('foregrounds an application by id', () => {
    expectTypeOf<ValueOf<'applications.foreground'>>().toExtend<string | null>()
  })
})
