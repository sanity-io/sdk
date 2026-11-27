import {expectTypeOf, test} from 'vitest'

import {
  type ApplicationConfig,
  type CapabilityRecord,
  type DashboardApplication,
  type DashboardTopics,
  type EventTopic,
  type EventTopicDef,
  type MessageBus,
  type MessageBusAbortOptions,
  type MessageBusEmitOptions,
  type MessageBusEmitResult,
  type MessageBusError,
  type MessageBusErrorCode,
  type MessageBusErrorDetails,
  type MessageBusHost,
  type MessageBusMessage,
  type MessageBusMeta,
  type MessageBusQueryOptions,
  type PayloadOf,
  type RemoteModuleRef,
  type ReplyOf,
  type StateTopicDef,
  type TileView,
  type TopicName,
  type Topics,
  useApplicationBasePath,
  type useAssetSource,
  useCapabilities,
  type usePanel,
  type useTile,
  type useView,
  type View,
  type WebWorker,
  type WebWorkerProps,
} from './dashboard'
import {
  type ApplicationStatus,
  type ApplicationStatusUpdate,
  type installMessageBus,
  type resetMessageBus,
} from './dashboard-internal'

// Guards issue #1: every `@public` message bus type must be reachable from the
// `@sanity/sdk-react/dashboard` entrypoint. A missing export fails `ts:check`
// on the import above.
test('dashboard entrypoint exposes the message bus public types', () => {
  // EventTopic is exported, so PayloadOf/ReplyOf are usable over event topics.
  expectTypeOf<PayloadOf<'auth.token.refresh'>>().toEqualTypeOf<void>()
  expectTypeOf<ReplyOf<'auth.token.refresh'>>().toEqualTypeOf<string>()
  expectTypeOf<EventTopic>().toExtend<TopicName>()

  // A consumer can name the constraint to write a generic wrapper over event topics.
  const wrap = <K extends EventTopic>(type: K, payload: PayloadOf<K>): [K, PayloadOf<K>] => [
    type,
    payload,
  ]
  expectTypeOf(wrap).toBeFunction()

  // Topic declarations are reachable for declaration merging.
  expectTypeOf<TopicName>().toEqualTypeOf<keyof Topics>()
  expectTypeOf<keyof DashboardTopics>().toExtend<TopicName>()
  expectTypeOf<StateTopicDef<number>['value']>().toBeNumber()
  expectTypeOf<EventTopicDef<{n: number}, string>['payload']>().toEqualTypeOf<{n: number}>()

  // The error code can be named when switching on `MessageBusError.code`.
  expectTypeOf<MessageBusError['code']>().toEqualTypeOf<MessageBusErrorCode>()
  // A refusal's fix and docs link can be typed when passing them to `reject`.
  expectTypeOf<MessageBusErrorDetails['fix']>().toEqualTypeOf<string | undefined>()

  // Event handlers and operation options can be typed explicitly.
  expectTypeOf<MessageBusMessage<{n: number}, string>['payload']>().toEqualTypeOf<{n: number}>()
  expectTypeOf<MessageBusMeta['appId']>().toBeString()
  expectTypeOf<MessageBusAbortOptions['signal']>().toEqualTypeOf<AbortSignal | undefined>()
  expectTypeOf<MessageBusEmitOptions['timeout']>().toEqualTypeOf<number | null | undefined>()
  expectTypeOf<MessageBusQueryOptions['timeout']>().toEqualTypeOf<number | null | undefined>()
  expectTypeOf<MessageBusEmitResult<string>>().toExtend<PromiseLike<string>>()
  expectTypeOf<MessageBus['query']>().toBeFunction()
  expectTypeOf<ReturnType<typeof useApplicationBasePath>>().toEqualTypeOf<string>()
  expectTypeOf<ReturnType<typeof useCapabilities>>().toEqualTypeOf<CapabilityRecord>()
  expectTypeOf<MessageBusHost['connections']['subscribe']>().toBeFunction()
})

test('view hooks return views with their application, useApplications lists them without', () => {
  expectTypeOf<ReturnType<typeof useView>>().toEqualTypeOf<View>()
  // Each hook returns the whole `View` member for its surface, not a narrower shape.
  expectTypeOf<ReturnType<typeof usePanel>['view']>().toEqualTypeOf<
    Extract<View, {surface: 'panel'}>
  >()
  expectTypeOf<ReturnType<typeof useTile>['view']>().toEqualTypeOf<
    Extract<View, {surface: 'tile'}>
  >()
  expectTypeOf<ReturnType<typeof useAssetSource>['view']>().toEqualTypeOf<
    Extract<View, {surface: 'asset_source'}>
  >()
  expectTypeOf<ReturnType<typeof useView>>().not.toHaveProperty('type')

  // Every interface type except `worker` is a view, with `app` as `window`.
  expectTypeOf<View['surface']>().toEqualTypeOf<'window' | 'panel' | 'tile' | 'asset_source'>()

  type ListedView = DashboardApplication['views'][number]
  expectTypeOf<ListedView>().not.toHaveProperty('application')
  expectTypeOf<DashboardApplication['webWorkers'][number]>().not.toHaveProperty('application')
  // `surface` still narrows `metadata` on a listed view.
  expectTypeOf<Extract<ListedView, {surface: 'tile'}>['metadata']>().toEqualTypeOf<
    TileView['metadata']
  >()

  expectTypeOf<WebWorker['application']>().toEqualTypeOf<View['application']>()
  expectTypeOf<View['application']>().not.toHaveProperty('views')
  expectTypeOf<View['application']>().not.toHaveProperty('webWorkers')
  // Each kind keeps its own fields, so `type` still narrows.
  expectTypeOf<Extract<View['application'], {type: 'installation'}>>().toHaveProperty(
    'installation',
  )
  // Views, web workers and application configs share the same flat module fields.
  expectTypeOf<View>().toExtend<RemoteModuleRef>()
  expectTypeOf<WebWorker>().toExtend<RemoteModuleRef>()
  expectTypeOf<ApplicationConfig>().toExtend<RemoteModuleRef>()
})

test('WebWorkerProps describes the worker with its application', () => {
  expectTypeOf<WebWorkerProps['worker']>().toEqualTypeOf<WebWorker>()
})

test('WebWorkerProps bus.subscribe takes a handler and has no observable form', () => {
  const worker = ({bus}: WebWorkerProps) => {
    bus.subscribe('workers.post', (message) => {
      expectTypeOf(message.type).toEqualTypeOf<'workers.post'>()
    })
    bus.subscribe('auth.token', (value) => {
      expectTypeOf(value).toEqualTypeOf<string | null>()
    })
    // @ts-expect-error an event topic cannot be subscribed to without a handler
    bus.subscribe('workers.post')
    // @ts-expect-error a state topic cannot be subscribed to without a handler
    bus.subscribe('auth.token')
  }
  expectTypeOf(worker).toBeFunction()
})

test('internal entrypoint exposes dashboard internals', () => {
  expectTypeOf<ApplicationStatus>().toEqualTypeOf<{label: string | null}>()
  expectTypeOf<ApplicationStatusUpdate>().toEqualTypeOf<{
    name: string
    value: ApplicationStatus
  }>()
  expectTypeOf<PayloadOf<'applications.status.update'>>().toEqualTypeOf<ApplicationStatusUpdate>()
  const emitApplicationStatus = (messageBus: ReturnType<typeof installMessageBus>) => {
    messageBus.emit('applications.status.update', {name: 'list', value: {label: null}})
    // @ts-expect-error application statuses always carry a label field
    messageBus.emit('applications.status.update', {name: 'list', value: null})
  }
  const subscribeToApplicationStatus = (messageBus: ReturnType<typeof installMessageBus>) => {
    messageBus.subscribe('applications.status.update')
    messageBus.subscribe('applications.status.update', (message) => {
      expectTypeOf(message.type).toEqualTypeOf<'applications.status.update'>()
    })
  }
  expectTypeOf(emitApplicationStatus).toBeFunction()
  expectTypeOf(subscribeToApplicationStatus).toBeFunction()
  expectTypeOf<typeof installMessageBus>().toBeFunction()
  expectTypeOf<typeof resetMessageBus>().toBeFunction()
})
