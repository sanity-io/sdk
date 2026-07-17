import {of} from 'rxjs'
import {expectTypeOf, test} from 'vitest'

import {type SanityInstance} from './createSanityInstance'
import {
  defineFetcher,
  defineMutation,
  type Fetcher,
  type FetcherSnapshot,
  type MutationResult,
} from './fetcherStore'

declare const instance: SanityInstance

interface Widget {
  id: string
  label: string
}

// No explicit generics anywhere below: `TData` is inferred from `fetch`'s
// `Observable<T>` and `TParams` from the annotated `getKey`/`fetch` params —
// the whole handle is inferred from the definition, TanStack-style.

// A list fetcher: no params, resolves to Widget[].
const widgets = defineFetcher({
  name: 'test-d-widgets',
  getKey: () => 'all',
  fetch: () => () => of<Widget[]>([]),
})

// A detail fetcher: one string param, resolves to Widget.
const widget = defineFetcher({
  name: 'test-d-widget',
  getKey: (_i, id) => id,
  fetch: () => (id: string) => of<Widget>({id, label: ''}),
})

test('the handle is inferred from the definition — no explicit generics', () => {
  expectTypeOf(widgets).toEqualTypeOf<Fetcher<[], Widget[]>>()
  expectTypeOf(widget).toEqualTypeOf<Fetcher<[id: string], Widget>>()
})

test('unannotated getKey params are inferred (not any) from the fetcher', () => {
  defineFetcher({
    name: 'test-d-getkey-infer',
    // `id` is not annotated here — it must be inferred as `string` from `fetch`.
    getKey: (_i, id) => {
      expectTypeOf(id).toEqualTypeOf<string>()
      return id
    },
    fetch: () => (id: string) => of<Widget>({id, label: ''}),
  })
})

test('getState carries TData through the snapshot envelope (not unknown)', () => {
  expectTypeOf(widgets.getState(instance).getCurrent()).toEqualTypeOf<FetcherSnapshot<Widget[]>>()
})

test('the snapshot discriminates data by status', () => {
  const snap = widget.getState(instance, 'w1').getCurrent()
  if (snap.status === 'success') {
    expectTypeOf(snap.data).toEqualTypeOf<Widget>()
    expectTypeOf(snap.dataUpdatedAt).toEqualTypeOf<number>()
  }
  if (snap.status === 'pending') {
    expectTypeOf(snap.data).toEqualTypeOf<undefined>()
  }
})

test('resolveState and refetch resolve to TData', () => {
  expectTypeOf(widgets.resolveState(instance)).resolves.toEqualTypeOf<Widget[]>()
  expectTypeOf(widget.refetch(instance, 'w1')).resolves.toEqualTypeOf<Widget>()
})

test('the params tuple is enforced per fetcher', () => {
  // @ts-expect-error — detail fetcher requires an id
  void widget.getState(instance)
  // @ts-expect-error — id must be a string
  void widget.getState(instance, 123)
  // @ts-expect-error — list fetcher takes no params
  void widgets.getState(instance, 'nope')
})

test('setData updater is typed to TData', () => {
  widget.setData(instance, ['w1'], {id: 'w1', label: 'x'})
  widget.setData(instance, ['w1'], (current) => {
    expectTypeOf(current).toEqualTypeOf<Widget | undefined>()
    return {id: 'w1', label: 'y'}
  })
  // @ts-expect-error — value must be a full Widget
  widget.setData(instance, ['w1'], {id: 'w1'})
  // @ts-expect-error — updater function must return TData
  widget.setData(instance, ['w1'], () => 42)
})

test('defineMutation resolves to a MutationResult of TResult with a typed input', () => {
  const createWidget = defineMutation<{label: string}, Widget>({
    name: 'test-d-create-widget',
    mutationFn: () => (input) => {
      expectTypeOf(input).toEqualTypeOf<{label: string}>()
      return of<Widget>({id: 'x', label: input.label})
    },
  })
  expectTypeOf(createWidget(instance, {label: 'a'})).resolves.toEqualTypeOf<
    MutationResult<Widget>
  >()
})

test('CacheWriter enforces the target fetcher’s TData and TParams', () => {
  defineMutation<void, void>({
    name: 'test-d-write-through',
    mutationFn: () => () => of(undefined),
    onMutate: (write) => {
      write(widget, ['w1'], {id: 'w1', label: 'ok'})
      // @ts-expect-error — value must match the fetcher's TData (Widget)
      write(widget, ['w1'], {nope: true})
      // @ts-expect-error — params must match the fetcher's TParams ([string])
      write(widget, [], {id: 'w1', label: 'ok'})
    },
  })
})
