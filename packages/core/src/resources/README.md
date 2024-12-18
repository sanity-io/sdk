# SDK Resource Management

## Resources

In the SDK, we group together state and functions that concern that state into a unit called a **Resource**.

To create a resource, call `createResource` with a `name` for the resource (this will be used as the key in the resource cache), a `getInitialState` function which takes in a `SanityInstance` and return the initial state, and an optional initialize function that can set up any subscriptions.

```ts
// documentList.ts
import {SyncTag} from '@sanity/client'
import {createResource} from '../resources/createResource'
import {subscribeToLiveContentAndSetLastLiveEventId} from './subscribeToLiveContentAndSetLastLiveEventId'

// declare the state shape for this resource
interface DocumentListState {
  results: DocumentHandle[]
  syncTags: SyncTag[]
  lastLiveEventId: string | null
}

export const documentList = createResource<DocumentListState>({
  name: 'documentList',
  getInitialState(instance) {
    // utilize the instance to set a different initial state
    // instance.config.someConfigOption

    return {results: [], syncTags: [], lastLiveEventId: null}
  },
  initialize() {
    // set up subscriptions
    const liveContentSubscription = subscribeToLiveContentAndSetLastLiveEventId(this)

    return () => {
      // teardown / cleanup
      // this function will be ran when `instance.dispose()` is called
      liveContentSubscription.unsubscribe()
    }
  },
})
```

## Actions

**Actions** are functions that are auto-magically bound to a resource by using `createAction`.

```ts
// subscribeToLiveContentAndSetLastLiveEventId.ts
import {createAction} from '../resources/createAction'
import {getClientSource} from '../client/getClientSource'
import {documentList} from './documentList'

// use `createAction` to create a function that binds the resource's state
export const subscribeToLiveContentAndSetLastLiveEventId = createAction(
  // provide the resource you'd like to bind this action to
  () => documentList,
  // provide the implementation of the function using the provided `state` or `instance`
  ({state, instance}) => {
    // return a function, the parameters here will be the parameters of the resulting action
    return function () {
      const client$ = getClientSource(instance).observable
      const liveMessage$ = client$.pipe(switchMap((client) => client.live.events()))

      return liveMessage$.subscribe((e) => {
        const {syncTags} = state.get()
        if (e.type === 'message' && e.tags.some((tag) => syncTags.includes(tag))) {
          state.set('setLastLiveEventId', {lastLiveEventId: e.id})
        }
      })
    }
  },
)
```

`createAction` returns a function that takes in either just an `instance` or an object with a instance and the initialized resource state `{instance, state}`.

If the initialized state is not passed into the action, it will call `getOrCreateResource` to grab the existing resource state or to initialize the resource state if not already created. Take a look at the [implementation](./createAction.ts) to see this in action.

---

When using a resource action from the same resource, the convention is to pass `this` which is bound to an object that contains the initialized state and the current instance.

```ts
import {createAction} from '../resources/createAction'
import {fooResource} from './fooResource'

const privateFooAction = createAction(
  () => fooResource,
  ({state, instance}) => {
    return function (value: string) {
      // do something with state
    }
  },
)

export const publicFooAction = createAction(
  () => fooResource,
  ({state, instance}) => {
    return function () {
      const result = privateFooAction(this, 'some value')
      return result
    }
  },
)
```

When using a resource action from a different resource, the convention is to just pass in an instance and rely on `getOrCreateResource` to pull or create the state for the resource.

```ts
import {createAction} from '../resources/createAction'
import {barResource} from './barResource'
import {publicFooAction} from '../foo/publicFooAction'

export const barActionThatUsesFooAction = createAction(
  () => barResource,
  ({state, instance}) => {
    return function () {
      const result = publicFooAction(instance)
      return `from foo: ${result}`
    }
  },
)
```

`this` is also available to be used in the `initialize` function provided to `createResource`

```ts
import {createResource} from '../resources/createResource'
import {barActionThatUsesFooAction} from './barActionThatUsesFooAction'

const barResource = createResource({
  name: 'bar',
  getInitialState: () => ({}),
  initialize() {
    const result = barActionThatUsesFooAction(this)
    // ...

    return () => {
      // ...
    }
  },
})
```

## Stores

By default, actions are global meaning that calling them with a sanity instance will result in global resource state available to all actions that use the same resource.

There are certain cases like the document list where we do not want global state. This is where `createStore` comes in.

```ts
interface TestState {
  value: number
}

const testResource = createResource<TestState>({
  name: 'test',
  getInitialState: () => ({value: 0}),
  initialize() {
    // set up subscriptions etc
    return () => {}
  },
})

const inc = createAction(
  () => testResource,
  ({state}) => {
    return function () {
      state.set('increment', (prevState) => ({value: prevState.value + 1}))
    }
  },
)

const set = createAction(
  () => testResource,
  ({state}) => {
    return function (value: number) {
      state.set('setValue', {value})
    }
  },
)

const get = createAction(
  () => testResource,
  ({state}) => {
    return function () {
      return state.get().value
    }
  },
)

export const createTestStore = createStore(testResource, {inc, set, get})
```

Now `createTestStore` will return an object with the actions bound to it as methods.

```ts
import {createTestStore} from './createTestStore'

const testStore = createTestStore(instance)

console.log(testStore.get()) // 0
testStore.inc()

console.log(testStore.get()) // 1

// calls the clean up function returned in initialize
testStore.dispose()
```

## Resource State

All resource actions are provided with a `state` param of type `ResourceState` that contains a `get`, `set`, and `observable` properties.

```ts
export type ResourceState<TState> = {
  get: () => TState
  set: (name: string, state: Partial<TState> | ((s: TState) => Partial<TState>)) => void
  observable: Observable<TState>
}
```

```ts
import {map, distinctUntilChanged} from 'rxjs'
import {createAction} from '../resources/createAction'
import {myResource} from './myResource'

export const myAction = createAction(
  () => myResource,
  ({state, instance}) => {
    return function (value: string) {
      // call `state.get` to get the current resource state
      const currentState = state.get()

      // call `state.set` with an update label (for redux dev tools)
      // with either a new state value or a function that returns new state.
      // Note: state.set is powered by zustand which always shallowly
      // with the previous state in the store
      // https://zustand.docs.pmnd.rs/guides/updating-state
      state.set('stateUpdateLabel', (prev) => ({foo: value}))

      // you can also subscribe to internal state changes via `state.observable`
      const subscription = state.observable
        .pipe(
          map((s) => s.foo),
          distinctUntilChanged(),
        )
        .subscribe(console.log)

      return subscription
    }
  },
)
```

## State Sources

A `StateSource` represents a stream of changing values derived from the state of a resource.

```ts
export interface StateSource<T> {
  // `getCurrent` allows the current state to be pulled without creating a subscription
  getCurrent: () => T
  // `subscribe` allows us to notify consumers when a new value is available.
  // note that this callback does not accept any parameters and the expectation
  // is for consumers to pull from `getCurrent`.
  subscribe: (onStoreChanged: () => void) => () => void
  // `observable` is provides combination of the above. on subscribe, this will
  // emit the current value from `getCurrent` and will update when the above
  // `subscribe` fires
  observable: Observable<T>
}
```

By convention, actions that return state sources should end with the `-Source` suffix.

```ts
// example usage in a hook
import {getSchemaSource} from '@sanity/sdk'
import {useSanityInstance} from '@sanity/sdk-react/hooks'

export function useSchema(): Schema {
  const instance = useSanityInstance()
  const {subscribe, getCurrent} = useMemo(() => getSchemaSource(instance), [instance])

  return useSyncExternalStore(subscribe, getCurrent)
}
```

```ts
// example usage in an action
import {getSchemaSource} from '../schema/getSchemaSource'
import {createAction} from '../resources/createAction'
import {myResource} from './myResource'

export const myAction = createAction(
  () => myResource,
  ({state, instance}) => {
    return function () {
      const schema$ = getSchemaSource(instance).observable

      // ...
    }
  },
)
```

Creating a state source involves creating an action to pull the desired value from state and then using `createStateSourceAction`.

```ts
import {previewStore} from './previewStore'
import {createAction} from '../resources/createAction'
import {createStateSourceAction} from '../resources/createStateSourceAction'

export const getPreview = createAction(
  () => previewStore,
  ({state}) => {
    return function (documentId: string) {
      return state.get().values[documentId]
    }
  },
)

export const getPreviewSource = createStateSourceAction(() => previewStore, getPreview)
```

Note: it's important that the `getCurrent` action returns a stable value from the store or it will cause infinite loops.
