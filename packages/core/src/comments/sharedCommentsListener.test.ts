import {type ListenEvent, type SanityClient} from '@sanity/client'
import {BehaviorSubject, of, Subject} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {type DocumentResource} from '../config/sanityConfig'
import {createSanityInstance, type SanityInstance} from '../store/createSanityInstance'
import {UPSTREAM_CLOSE_DELAY_MS} from '../store/createStoreInstance'
import {ORGANIZATION_ID, storedComment} from './__fixtures__/comments'
import {observeCommentsClient, observeCommentsOrganizationId} from './commentsClient'
import {getSharedCommentsListener} from './sharedCommentsListener'
import {type StoredComment} from './types'

vi.mock('./commentsClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./commentsClient')>()),
  observeCommentsClient: vi.fn(),
  observeCommentsOrganizationId: vi.fn(),
}))

const WELCOME = {type: 'welcome'} as ListenEvent<StoredComment>

const RESOURCE: DocumentResource = {projectId: 'p', dataset: 'd'}
const OTHER_RESOURCE: DocumentResource = {projectId: 'p', dataset: 'staging'}

let instance: SanityInstance
let listens: Subject<ListenEvent<StoredComment>>[]
let listen: ReturnType<typeof vi.fn>
let client$: BehaviorSubject<SanityClient>
/** Which organization a resource resolves to, so a test can put two in one. */
let organizations: Map<string, string>

beforeEach(() => {
  vi.useFakeTimers()
  listens = []
  organizations = new Map([
    [RESOURCE.dataset!, ORGANIZATION_ID],
    [OTHER_RESOURCE.dataset!, ORGANIZATION_ID],
  ])

  listen = vi.fn(() => {
    const listen$ = new Subject<ListenEvent<StoredComment>>()
    listens.push(listen$)
    return listen$
  })

  client$ = new BehaviorSubject({
    observable: {collaboration: {comments: {listen}}},
  } as unknown as SanityClient)

  vi.mocked(observeCommentsClient).mockReturnValue(client$)
  vi.mocked(observeCommentsOrganizationId).mockImplementation((_instance, resource) =>
    of(organizations.get((resource as {dataset?: string}).dataset ?? '')!),
  )

  instance = createSanityInstance({projectId: 'p', dataset: 'd'})
})

afterEach(() => {
  instance.dispose()
  vi.useRealTimers()
})

describe('getSharedCommentsListener', () => {
  it('listens for every comment in the organization', () => {
    getSharedCommentsListener(instance, RESOURCE).subscribe()

    expect(listen).toHaveBeenCalledWith(
      '*[_type == "sanity.comment"]',
      {},
      expect.objectContaining({tag: 'comments.listen', includeResult: true}),
    )
  })

  it('opens one connection for two resources in the same organization', () => {
    getSharedCommentsListener(instance, RESOURCE).subscribe()
    getSharedCommentsListener(instance, OTHER_RESOURCE).subscribe()

    expect(listen).toHaveBeenCalledTimes(1)
  })

  it('keeps organizations apart', () => {
    organizations.set(OTHER_RESOURCE.dataset!, 'org-2')

    getSharedCommentsListener(instance, RESOURCE).subscribe()
    getSharedCommentsListener(instance, OTHER_RESOURCE).subscribe()

    expect(listen).toHaveBeenCalledTimes(2)
  })

  it('delivers every comment to every reader', () => {
    const first: ListenEvent<StoredComment>[] = []
    const second: ListenEvent<StoredComment>[] = []
    getSharedCommentsListener(instance, RESOURCE).subscribe((event) => first.push(event))
    getSharedCommentsListener(instance, OTHER_RESOURCE).subscribe((event) => second.push(event))

    const appeared = {
      type: 'mutation',
      transition: 'appear',
      documentId: 'a',
      result: storedComment({_id: 'a'}),
    } as ListenEvent<StoredComment>
    listens[0].next(appeared)

    expect(first).toEqual([appeared])
    expect(second).toEqual([appeared])
  })

  it('replays the welcome to a reader that arrives after the connection is up', () => {
    getSharedCommentsListener(instance, RESOURCE).subscribe()
    listens[0].next(WELCOME)

    // Without this, a list that starts reading now would never fetch its first
    // snapshot: the welcome that sets that off has already been and gone.
    const late: ListenEvent<StoredComment>[] = []
    getSharedCommentsListener(instance, RESOURCE).subscribe((event) => late.push(event))

    expect(late).toEqual([WELCOME])
  })

  it('holds the connection open briefly after the last reader leaves', () => {
    const subscription = getSharedCommentsListener(instance, RESOURCE).subscribe()
    subscription.unsubscribe()

    // Long enough that a reader coming straight back reuses the connection
    // rather than reconnecting and refetching every list.
    getSharedCommentsListener(instance, RESOURCE).subscribe()

    expect(listen).toHaveBeenCalledTimes(1)
  })

  it('closes the connection once no one has read it for a while', () => {
    const subscription = getSharedCommentsListener(instance, RESOURCE).subscribe()
    subscription.unsubscribe()

    vi.advanceTimersByTime(UPSTREAM_CLOSE_DELAY_MS)
    expect(listens[0].observed).toBe(false)

    // And the next reader gets a connection of its own rather than a spent one.
    getSharedCommentsListener(instance, RESOURCE).subscribe()
    expect(listen).toHaveBeenCalledTimes(2)
  })

  it('reconnects when the client changes', () => {
    getSharedCommentsListener(instance, RESOURCE).subscribe()

    // A token refresh replaces the client, and the listener has to follow it.
    client$.next(client$.value)

    expect(listen).toHaveBeenCalledTimes(2)
  })
})
