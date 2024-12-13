import {type RawQuerylessQueryResponse, type SanityClient} from '@sanity/client'
import {evaluate, parse} from 'groq-js'
import {defer, NEVER, startWith, Subject} from 'rxjs'
import {beforeEach, describe, it, type Mock, vi} from 'vitest'

import {getClient} from '../client/getClient'
import {BATCH_DEBOUNCE_TIME, createPreviewStore} from './previewStore'
import {type PreviewStore} from './types'

interface MockClient {
  config: () => {token?: string}
  observable: {fetch: Mock<SanityClient['observable']['fetch']>}
  live: {
    events: () => Subject<{type: 'message'; id: string; tags: string[]}>
  }
}

const timeout = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

vi.mock('../client/getClient', () => {
  const dataset: Array<{_id: string; _type: string; name: string}> = [
    {_id: 'espen-id', _type: 'author', name: 'espen'},
    {_id: 'ryan-id', _type: 'author', name: 'ryan'},
    {_id: 'caro-id', _type: 'author', name: 'caro'},
    {_id: 'binoy-id', _type: 'author', name: 'binoy'},
    {_id: 'cole-id', _type: 'author', name: 'cole'},
  ]

  const fetch = vi.fn((...args: Parameters<SanityClient['observable']['fetch']>) =>
    defer(async () => {
      const [query, params] = args
      const value = await evaluate(parse(query), {dataset, params})
      const result = await value.get()
      const syncTags = (params as {__ids: string[]}).__ids.map((id) => `s1:${id}`)

      return {result, syncTags}
    }),
  )

  const subject = new Subject<{type: 'message'; id: string; tags: string[]}>()
  const mockClient: MockClient = {
    observable: {fetch},
    live: {
      events: () => subject,
    },
    config: () => ({token: 'exampleToken'}),
  }
  return {getClient: () => mockClient}
})

vi.mock('../client/getSubscribableClient', async () => {
  const mod = await import('../client/getClient')
  return {
    getSubscribableClient: () =>
      NEVER.pipe(
        startWith(
          // @ts-expect-error  params are not required since we're mocking
          mod.getClient(),
        ),
      ),
  }
})

describe('previewStore', () => {
  let previewStore!: PreviewStore
  let client!: MockClient

  beforeEach(async () => {
    vi.clearAllMocks()
    // @ts-expect-error params are not required since we're mocking
    previewStore = createPreviewStore()
    // @ts-expect-error params are not required since we're mocking
    client = getClient()
  })

  afterEach(() => {
    previewStore.dispose()
  })

  it('resolves a preview value for a given document handle', async () => {
    const preview = await previewStore.resolvePreview({
      document: {_id: 'espen-id', _type: 'author'},
    })

    expect(preview).toEqual({title: 'espen', subtitle: 'espen-id', media: null})
    expect(client.observable.fetch).toHaveBeenCalledTimes(1)

    const [[query, params, options]] = client.observable.fetch.mock.calls

    expect(query).toContain('*[_id in $__ids]')
    expect(params).toEqual({__ids: ['espen-id']})
    expect(options).toMatchObject({
      filterResponse: false,
      lastLiveEventId: undefined,
      signal: {},
    })
  })

  it('batches multiple requests for preview values into one query', async () => {
    const [espen, ryan] = await Promise.all([
      previewStore.resolvePreview({document: {_id: 'espen-id', _type: 'author'}}),
      previewStore.resolvePreview({document: {_id: 'ryan-id', _type: 'author'}}),
    ])

    expect(espen).toEqual({title: 'espen', subtitle: 'espen-id', media: null})
    expect(ryan).toEqual({title: 'ryan', subtitle: 'ryan-id', media: null})
    expect(client.observable.fetch).toHaveBeenCalledTimes(1)

    const [[query, params, options]] = client.observable.fetch.mock.calls

    expect(query).toContain(`*[_id in $__ids]`)
    expect(params).toEqual({__ids: ['espen-id', 'ryan-id']})
    expect(options).toMatchObject({
      filterResponse: false,
      lastLiveEventId: undefined,
      signal: {},
    })
  })

  it('debounces fetching the batch to reduce network churn', async () => {
    // kick-off fetching two documents at once at the same time
    const espenRyan = Promise.all([
      previewStore.resolvePreview({document: {_id: 'espen-id', _type: 'author'}}),
      previewStore.resolvePreview({document: {_id: 'ryan-id', _type: 'author'}}),
    ])
    // wait for a time smaller than the debounce time
    await timeout(BATCH_DEBOUNCE_TIME / 4)
    const caroBinoy = Promise.all([
      previewStore.resolvePreview({document: {_id: 'caro-id', _type: 'author'}}),
      previewStore.resolvePreview({document: {_id: 'binoy-id', _type: 'author'}}),
    ])
    // the above should be batched together

    // wait a time larger than the debounce time
    await timeout(BATCH_DEBOUNCE_TIME * 2)
    const colePromise = previewStore.resolvePreview({document: {_id: 'cole-id', _type: 'author'}})

    const [espen, ryan] = await espenRyan
    const [caro, binoy] = await caroBinoy
    const cole = await colePromise

    expect(espen).toEqual({title: 'espen', subtitle: 'espen-id', media: null})
    expect(ryan).toEqual({title: 'ryan', subtitle: 'ryan-id', media: null})
    expect(caro).toEqual({title: 'caro', subtitle: 'caro-id', media: null})
    expect(binoy).toEqual({title: 'binoy', subtitle: 'binoy-id', media: null})
    expect(cole).toEqual({title: 'cole', subtitle: 'cole-id', media: null})
    expect(client.observable.fetch).toHaveBeenCalledTimes(2)

    const [first, second] = client.observable.fetch.mock.calls.map(([query, params, options]) => ({
      query,
      params,
      options,
    }))

    expect(first.query).toContain('*[_id in $__ids]')
    expect(first.params).toEqual({__ids: ['espen-id', 'ryan-id', 'caro-id', 'binoy-id']})
    expect(second.query).toContain('*[_id in $__ids]')
    expect(second.params).toEqual({__ids: ['cole-id']})
  })

  it('re-fetches documents with active subscriptions based on the live content API', async () => {
    const getClientFetchCalls = () =>
      client.observable.fetch.mock.calls.map(([query, params, options]) => ({
        query,
        params,
        options,
      }))

    // these subscribe and keep the document in the batch
    const ryanSubscription = previewStore
      .events({document: {_id: 'ryan-id', _type: 'author'}})
      .subscribe({})
    const caroSubscription = previewStore
      .events({document: {_id: 'caro-id', _type: 'author'}})
      .subscribe({})

    // this should subscribe, fetch the value, and then remove the document from
    // its respective batch
    await previewStore.resolvePreview({
      document: {_id: 'espen-id', _type: 'author'},
    })

    const liveSubject = client.live.events()

    expect(client.observable.fetch).toHaveBeenCalledTimes(1)
    const [firstFetch] = getClientFetchCalls()

    expect(firstFetch.params).toEqual({
      __ids: ['ryan-id', 'caro-id', 'espen-id'],
    })

    // simulate a live event from the live content API
    liveSubject.next({
      id: 'first-message',
      type: 'message',
      // the mock client is set up to return sync tags based on the `__ids` sent
      // in so this will not be a sync tag the batch will be using
      tags: ['s1:no-match'],
    })

    // wait enough time for any requests to finish (if any)
    await timeout(BATCH_DEBOUNCE_TIME + 10)

    // the fetch should not have been called again
    expect(client.observable.fetch).toHaveBeenCalledTimes(1)

    // simulate another live event from the live content API
    liveSubject.next({
      id: 'second-message',
      type: 'message',
      // note: this sync tag is associated with the `espen-id` document. this
      // document is no longer in the batch but its respective sync tag still
      // is because sync tags are opaque by design and content lake does not
      // give us the ability to map sync tags to document IDs so the trade-off
      // is that we will over-fetch based on out-dated sync tags but when we do
      // re-fetch, it will only contain the documents with active subscriptions
      // in the batch
      tags: ['s1:espen-id'],
    })
    // wait enough time for any requests to finish (if any)
    await timeout(BATCH_DEBOUNCE_TIME + 10)

    // this time, there should be a new call!
    expect(client.observable.fetch).toHaveBeenCalledTimes(2)

    const [, secondFetch] = getClientFetchCalls()
    // now this batch will only contain ryan and caro
    expect(secondFetch.params).toEqual({__ids: ['ryan-id', 'caro-id']})
    expect(secondFetch.options).toMatchObject({lastLiveEventId: 'second-message'})

    // simulate another live event from the live content API with the espen tag
    liveSubject.next({
      id: 'third-message',
      type: 'message',
      // now we try again with the espen-id sync tag. this should no longer be
      // in the batch's sync tags and should result in a no-op
      tags: ['s1:espen-id'],
    })
    await timeout(BATCH_DEBOUNCE_TIME + 10)

    expect(client.observable.fetch).toHaveBeenCalledTimes(2) // still just 2 times

    // now we test unsubscribing and re-fetching
    ryanSubscription.unsubscribe()

    // simulate another live event from the live content API with the espen tag
    liveSubject.next({
      id: 'fourth-message',
      type: 'message',
      // even though ryan unsubscribed, it's still in the batch's sync tags
      tags: ['s1:ryan-id'],
    })
    await timeout(BATCH_DEBOUNCE_TIME + 10)
    expect(client.observable.fetch).toHaveBeenCalledTimes(3)

    const [, , thirdFetch] = getClientFetchCalls()
    expect(thirdFetch.params).toEqual({__ids: ['caro-id']})
    expect(thirdFetch.options).toMatchObject({lastLiveEventId: 'fourth-message'})

    caroSubscription.unsubscribe()
  })

  it('cancels any inflight batches when new batches are initiated', async () => {
    // mock fetch to create a long-running request that can be aborted
    let firstResolve!: () => void
    client.observable.fetch.mockImplementationOnce((query, params) =>
      defer(async (): Promise<RawQuerylessQueryResponse<unknown>> => {
        await new Promise<void>((resolve) => {
          firstResolve = resolve
        })
        const value = await evaluate(parse(query), {
          dataset: [{_id: 'espen-id', _type: 'author', name: 'espen'}],
          params,
        })
        return {ms: 0, result: await value.get(), syncTags: ['s1:espen-id']}
      }),
    )

    // start first request
    const firstRequest = previewStore.resolvePreview({
      document: {_id: 'espen-id', _type: 'author'},
    })

    // Wait for debounce to ensure first request starts
    await timeout(BATCH_DEBOUNCE_TIME + 10)

    // Start second request while first is still pending
    const secondRequest = previewStore.resolvePreview({
      document: {_id: 'ryan-id', _type: 'author'},
    })

    // complete first request
    firstResolve()

    // both should complete successfully due to batching
    const [first, second] = await Promise.all([firstRequest, secondRequest])

    expect(first).toEqual({title: 'espen', subtitle: 'espen-id', media: null})
    expect(second).toEqual({title: 'ryan', subtitle: 'ryan-id', media: null})

    // the first fetch should have been aborted and a new batch created
    expect(client.observable.fetch).toHaveBeenCalledTimes(2)
    const [firstFetch] = client.observable.fetch.mock.calls
    expect(firstFetch[2].signal?.aborted).toBe(true)
  })

  it('clears the cache when clearCache is called', async () => {
    // First fetch to populate cache
    await previewStore.resolvePreview({
      document: {_id: 'espen-id', _type: 'author'},
    })

    // Check initial state
    const [beforeClear] = previewStore.getPreview({
      document: {_id: 'espen-id', _type: 'author'},
    })
    expect(beforeClear).toEqual({title: 'espen', subtitle: 'espen-id', media: null})

    // Clear cache
    previewStore.clearCache()

    // Check state after clear
    const afterClear = previewStore.getPreview({
      document: {_id: 'espen-id', _type: 'author'},
    })
    expect(afterClear).toEqual([null, false])
  })

  it('unsubscribes from the live content API when dispose is called', () => {
    const liveSubject = client.live.events()

    // Subscribe to a document to ensure we have active subscriptions
    previewStore.events({document: {_id: 'espen-id', _type: 'author'}}).subscribe({})

    // Dispose of the store
    previewStore.dispose()

    // Verify that sending more live events doesn't trigger fetches
    liveSubject.next({
      type: 'message',
      id: 'post-dispose',
      tags: ['s1:espen-id'],
    })

    expect(client.observable.fetch).not.toHaveBeenCalled()
  })
})
