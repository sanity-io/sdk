import {ClientError, type SanityClient} from '@sanity/client'
import {concatWith, NEVER, of, Subject, throwError} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, onTestFinished, vi} from 'vitest'

import {getClientState} from '../client/clientStore'
import {createSanityInstance, type SanityInstance} from '../store/createSanityInstance'
import {type StateSource} from '../store/createStateSourceAction'
import {updateUserPreferenceListItem, userPreferenceList} from './preferenceItems'

vi.mock('../client/clientStore')

const QUERIES = 'studio.vision-tool.saved-queries'
const ITEMS = `/projects/project-1/users/me/preferences/${QUERIES}/items`

const query = (id: string) => ({_key: id, url: `?query=*[_id == "${id}"]`, savedAt: '2026-11-09'})
const item = (id: string) => ({itemId: id, value: query(id), addedAt: 't', updatedAt: 't'})

describe('preference items', () => {
  let instance: SanityInstance
  const request = vi.fn()

  beforeEach(() => {
    instance = createSanityInstance({projectId: 'project-1', dataset: 'production'})
    request.mockReset()
    vi.mocked(getClientState).mockReturnValue({
      observable: of({observable: {request}} as unknown as SanityClient),
    } as StateSource<SanityClient>)
  })

  afterEach(() => instance.dispose())

  const ids = (list: {data: {itemId: string}[]}) => list.data.map(({itemId}) => itemId)

  it('reads the first page, and says when there are more', async () => {
    request.mockReturnValueOnce(of({data: [item('q1')], nextCursor: 'c1'}))

    const list = await userPreferenceList.resolveState(instance, 'user-1', QUERIES)

    expect(list).toEqual({data: [item('q1')], hasMore: true})
    expect(request).toHaveBeenCalledExactlyOnceWith({
      url: ITEMS,
      query: {},
      tag: 'preferences.items.list',
      timeout: 10_000,
    })
  })

  it('answers while the client stays open, as it does in an app', async () => {
    vi.mocked(getClientState).mockReturnValue({
      observable: of({observable: {request}} as unknown as SanityClient).pipe(concatWith(NEVER)),
    } as StateSource<SanityClient>)
    request
      .mockReturnValueOnce(of({data: [item('q1')], nextCursor: 'c1'}))
      .mockReturnValueOnce(of({data: [item('q2')], nextCursor: null}))

    const list = await userPreferenceList.resolveState(instance, 'user-1', QUERIES, {pages: 2})

    expect(ids(list)).toEqual(['q1', 'q2'])
  })

  it('reads the pages asked for in order, each with the cursor the one before returned', async () => {
    request
      .mockReturnValueOnce(of({data: [item('q1'), item('q2')], nextCursor: 'c1'}))
      .mockReturnValueOnce(of({data: [item('q3')], nextCursor: null}))

    const list = await userPreferenceList.resolveState(instance, 'user-1', QUERIES, {pages: 3})

    expect(ids(list)).toEqual(['q1', 'q2', 'q3'])
    expect(list.hasMore).toBe(false)
    expect(request).toHaveBeenCalledTimes(2)
    expect(request).toHaveBeenNthCalledWith(2, {
      url: ITEMS,
      query: {cursor: 'c1'},
      tag: 'preferences.items.list',
      timeout: 10_000,
    })
  })

  it('reads more pages of a list it has already read, rather than serving the cached pages', async () => {
    request.mockImplementation((options) =>
      of(
        options.query.cursor
          ? {data: [item('q2')], nextCursor: null}
          : {data: [item('q1')], nextCursor: 'c1'},
      ),
    )
    await userPreferenceList.resolveState(instance, 'user-1', QUERIES)

    const more = await userPreferenceList.resolveState(instance, 'user-1', QUERIES, {pages: 2})

    expect(ids(more)).toEqual(['q1', 'q2'])
  })

  it('reads the list again every minute while it is subscribed, so a change made elsewhere shows', async () => {
    vi.useFakeTimers({toFake: ['setInterval', 'clearInterval']})
    onTestFinished(() => {
      vi.useRealTimers()
    })
    request.mockReturnValue(of({data: [item('q1')], nextCursor: null}))
    const unsubscribe = userPreferenceList.getState(instance, 'user-1', QUERIES).subscribe()
    onTestFinished(unsubscribe)
    await vi.waitFor(() => expect(request).toHaveBeenCalledOnce())

    vi.advanceTimersByTime(60_000)

    expect(request).toHaveBeenCalledTimes(2)
  })

  it('reads every page again from the first after a change, so an item that moved page shows once', async () => {
    // The API's cursor points at the last item on a page
    const pages: Record<string, {data: ReturnType<typeof item>[]; nextCursor: string | null}> = {
      '': {data: [item('q1'), item('q2')], nextCursor: 'after-q2'},
      'after-q2': {data: [item('q3')], nextCursor: null},
    }
    request.mockImplementation((options) =>
      options.url.endsWith('/items') ? of(pages[options.query.cursor ?? '']) : of(item('q0')),
    )
    const list = userPreferenceList.getState(instance, 'user-1', QUERIES, {pages: 2})
    const unsubscribe = list.subscribe()
    await vi.waitFor(() => expect(list.getCurrent()).toMatchObject({status: 'success'}))

    // Adding q0 at the start pushes q2 onto the second page
    pages[''] = {data: [item('q0'), item('q1')], nextCursor: 'after-q1'}
    pages['after-q1'] = {data: [item('q2'), item('q3')], nextCursor: null}
    await updateUserPreferenceListItem(instance, {
      userId: 'user-1',
      key: QUERIES,
      itemId: 'q0',
      value: query('q0'),
    })

    await vi.waitFor(() => expect(ids(list.getCurrent().data!)).toEqual(['q0', 'q1', 'q2', 'q3']))
    unsubscribe()
  })

  it('saves an item, then reads the list again so it shows', async () => {
    request.mockReturnValueOnce(of({data: [], nextCursor: null}))
    const page = userPreferenceList.getState(instance, 'user-1', QUERIES)
    const unsubscribe = page.subscribe()
    await vi.waitFor(() => expect(page.getCurrent()).toMatchObject({status: 'success'}))
    request
      .mockReturnValueOnce(of(item('q1')))
      .mockReturnValueOnce(of({data: [item('q1')], nextCursor: null}))

    await updateUserPreferenceListItem(instance, {
      userId: 'user-1',
      key: QUERIES,
      itemId: 'q1',
      value: query('q1'),
    })

    await vi.waitFor(() => expect(page.getCurrent()).toMatchObject({data: {data: [item('q1')]}}))
    expect(request).toHaveBeenNthCalledWith(2, {
      url: `${ITEMS}/q1`,
      method: 'PUT',
      body: {value: query('q1')},
      tag: 'preferences.items.set',
      timeout: 10_000,
    })
    unsubscribe()
  })

  it('deletes an item for undefined, then reads the list again so it is gone', async () => {
    request.mockReturnValueOnce(of({data: [item('q1')], nextCursor: null}))
    const page = userPreferenceList.getState(instance, 'user-1', QUERIES)
    const unsubscribe = page.subscribe()
    await vi.waitFor(() => expect(page.getCurrent()).toMatchObject({status: 'success'}))
    request.mockReturnValueOnce(of(undefined)).mockReturnValueOnce(of({data: [], nextCursor: null}))

    await updateUserPreferenceListItem(instance, {
      userId: 'user-1',
      key: QUERIES,
      itemId: 'q1',
      value: undefined,
    })

    await vi.waitFor(() => expect(page.getCurrent()).toMatchObject({data: {data: []}}))
    expect(request).toHaveBeenNthCalledWith(2, {
      url: `${ITEMS}/q1`,
      method: 'DELETE',
      tag: 'preferences.items.remove',
      timeout: 10_000,
    })
    unsubscribe()
  })

  it('sends a delete made right after a save once the save is answered, so the item stays deleted', async () => {
    vi.useFakeTimers()
    onTestFinished(() => {
      vi.useRealTimers()
    })
    const save = new Subject<unknown>()
    request.mockReturnValueOnce(save).mockReturnValueOnce(of(undefined))

    const saving = updateUserPreferenceListItem(instance, {
      userId: 'user-1',
      key: QUERIES,
      itemId: 'q1',
      value: query('q1'),
    })
    const deleting = updateUserPreferenceListItem(instance, {
      userId: 'user-1',
      key: QUERIES,
      itemId: 'q1',
      value: undefined,
    })
    // A delete that's only delayed, not queued, would have gone by now
    await vi.runAllTimersAsync()
    expect(request).toHaveBeenCalledOnce()

    save.next(item('q1'))
    await Promise.all([saving, deleting])
    expect(request).toHaveBeenLastCalledWith(expect.objectContaining({method: 'DELETE'}))
  })

  it("never shows one user's cached list to another, or reads it again after their change", async () => {
    request.mockReturnValue(of({data: [item('q1')], nextCursor: null}))
    const mine = userPreferenceList.getState(instance, 'user-1', QUERIES)
    const unsubscribe = mine.subscribe()
    await vi.waitFor(() => expect(mine.getCurrent()).toMatchObject({status: 'success'}))

    expect(userPreferenceList.getState(instance, 'user-2', QUERIES).getCurrent()).toMatchObject({
      status: 'pending',
    })

    request.mockClear()
    await updateUserPreferenceListItem(instance, {
      userId: 'user-2',
      key: QUERIES,
      itemId: 'q2',
      value: query('q2'),
    })
    // A refetch of user-1's list would start in this tick, once the change is answered
    await Promise.resolve()
    expect(request).toHaveBeenCalledTimes(1)
    unsubscribe()
  })

  it("fails with the API's reason when it refuses a change", async () => {
    request.mockReturnValue(
      throwError(
        () =>
          new ClientError({
            statusCode: 400,
            headers: {},
            body: {code: 'valueInvalid', message: 'An item needs a url'},
          }),
      ),
    )

    await expect(
      updateUserPreferenceListItem(instance, {
        userId: 'user-1',
        key: QUERIES,
        itemId: 'q1',
        value: query('q1'),
      }),
    ).rejects.toMatchObject({code: 'valueInvalid', message: 'An item needs a url'})
  })

  it('rejects a change when there is no project', async () => {
    instance.dispose()
    instance = createSanityInstance({})

    await expect(
      updateUserPreferenceListItem(instance, {
        userId: 'user-1',
        key: QUERIES,
        itemId: 'q1',
        value: query('q1'),
      }),
    ).rejects.toMatchObject({code: 'levelNotAllowed'})
    await expect(
      updateUserPreferenceListItem(instance, {
        userId: 'user-1',
        key: QUERIES,
        itemId: 'q1',
        value: undefined,
      }),
    ).rejects.toMatchObject({code: 'levelNotAllowed'})
    expect(request).not.toHaveBeenCalled()
  })
})
