import {type SanityClient} from '@sanity/client'
import {defer, EmptyError, NEVER, ReplaySubject, Subject} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {getCurrentUserState} from '../auth/authStore'
import {getClientState} from '../client/clientStore'
import {createSanityInstance, type SanityInstance} from '../store/createSanityInstance'
import {createStoreState, type StoreState} from '../store/createStoreState'
import {type DocumentAction, editDocument, publishDocument} from './actions'
import {EDIT_BATCH_INTERVAL, SUBMISSION_RETRY_BASE_DELAY} from './documentConstants'
import {documentStore, type DocumentStoreState} from './documentStore'
import {type AppliedTransaction} from './reducers'

vi.mock('../auth/authStore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../auth/authStore')>()),
  getCurrentUserState: vi.fn(),
}))
vi.mock('../client/clientStore', () => ({getClientState: vi.fn()}))

const handle = {documentId: 'document', documentType: 'article'}

function applied(transactionId: string, action: DocumentAction): AppliedTransaction {
  return {
    transactionId,
    actions: [action],
    working: {},
    previous: {},
    base: {},
    previousRevs: {},
    outgoingActions: [],
    outgoingMutations: [],
    timestamp: new Date().toISOString(),
  }
}

describe('document submission with the production edit interval', () => {
  let instance: SanityInstance
  let state: StoreState<DocumentStoreState>
  let clients: ReplaySubject<SanityClient>
  let client: SanityClient
  let clientSubscriptions: number
  let action: ReturnType<typeof vi.fn>
  let cleanup: (() => void) | undefined
  let responses: Subject<{transactionId: string}>[]

  beforeEach(() => {
    vi.useFakeTimers()
    instance = createSanityInstance({projectId: 'test', dataset: 'test'})
    clients = new ReplaySubject(1)
    clientSubscriptions = 0
    responses = []
    action = vi.fn(() => {
      const response = new Subject<{transactionId: string}>()
      responses.push(response)
      return response
    })
    client = {observable: {action, request: () => NEVER}} as unknown as SanityClient
    vi.mocked(getClientState).mockReturnValue({
      observable: defer(() => {
        clientSubscriptions++
        return clients
      }),
      getCurrent: () => client,
      subscribe: () => () => {},
    })
    vi.mocked(getCurrentUserState).mockReturnValue({
      observable: NEVER,
      getCurrent: () => null,
      subscribe: () => () => {},
    })
    state = createStoreState<DocumentStoreState>({
      queued: [],
      applied: [],
      documentStates: {},
      fetchDocument: () => NEVER,
      events: new Subject(),
    })
    cleanup = documentStore.initialize?.({
      instance,
      state,
      key: {name: 'test.test', resource: {projectId: 'test', dataset: 'test'}},
    })
    // Ignore the initial ACL subscription made during store initialization.
    clientSubscriptions = 0
  })

  afterEach(() => {
    cleanup?.()
    instance.dispose()
    vi.useRealTimers()
  })

  function enqueue(
    id: string,
    documentAction: DocumentAction = editDocument(handle, {set: {title: id}}),
  ) {
    state.set('apply', (prev) => ({applied: [...prev.applied, applied(id, documentAction)]}))
  }

  function acknowledge(index: number) {
    const transactionId = state.get().outgoing!.transactionId
    responses[index].next({transactionId})
    responses[index].complete()
  }

  it('holds an outgoing transaction until a client arrives and submits it once', async () => {
    enqueue('waiting')
    await vi.advanceTimersByTimeAsync(0)
    expect(state.get().outgoing?.transactionId).toBe('waiting')
    expect(action).not.toHaveBeenCalled()
    clients.next(client)
    clients.next(client)
    expect(clientSubscriptions).toBe(1)
    expect(action).toHaveBeenCalledTimes(1)
    acknowledge(0)
    expect(state.get().outgoing).toBeUndefined()
  })

  it('re-reads the client source when retrying a failed submission', async () => {
    clients.next(client)
    enqueue('retrying')
    await vi.advanceTimersByTimeAsync(0)
    expect(clientSubscriptions).toBe(1)
    expect(action).toHaveBeenCalledTimes(1)

    const retryResponse = new Subject<{transactionId: string}>()
    const retryAction = vi.fn(() => retryResponse)
    const retryClient = {
      observable: {action: retryAction, request: () => NEVER},
    } as unknown as SanityClient
    clients.next(retryClient)

    responses[0].error(new Error('network blip'))
    await vi.advanceTimersByTimeAsync(SUBMISSION_RETRY_BASE_DELAY)

    expect(clientSubscriptions).toBe(2)
    expect(action).toHaveBeenCalledTimes(1)
    expect(retryAction).toHaveBeenCalledTimes(1)

    retryResponse.next({transactionId: state.get().outgoing!.transactionId})
    retryResponse.complete()
    expect(state.get().outgoing).toBeUndefined()
  })

  it('surfaces an empty client source instead of leaving a silent submission wait', async () => {
    enqueue('waiting')
    await vi.advanceTimersByTimeAsync(0)
    clients.complete()
    expect(state.get().error).toBeInstanceOf(EmptyError)
    expect(action).not.toHaveBeenCalled()
  })

  it('flushes edits before publishing and waits for each request acknowledgement', async () => {
    clients.next(client)
    enqueue('first')
    await vi.advanceTimersByTimeAsync(0)
    expect(action).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(100)
    acknowledge(0)
    enqueue('second')
    enqueue('third')
    await vi.advanceTimersByTimeAsync(100)
    expect(action).toHaveBeenCalledTimes(1)
    enqueue('publish', publishDocument(handle))
    await vi.advanceTimersByTimeAsync(0)
    expect(action).toHaveBeenCalledTimes(2)
    expect(state.get().outgoing?.batchedTransactionIds).toEqual(['second', 'third'])
    expect(state.get().applied.map((transaction) => transaction.transactionId)).toEqual(['publish'])
    expect(performance.now()).toBeLessThan(EDIT_BATCH_INTERVAL)
    acknowledge(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(action).toHaveBeenCalledTimes(3)
    expect(state.get().outgoing?.batchedTransactionIds).toEqual(['publish'])
    acknowledge(2)
    expect(state.get().outgoing).toBeUndefined()
    expect(state.get().applied).toEqual([])
  })
})
