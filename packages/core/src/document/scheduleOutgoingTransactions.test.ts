import {type Subscription} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {createStoreState, type StoreState} from '../store/createStoreState'
import {type Action, createDocument, editDocument, publishDocument} from './actions'
import {
  type AppliedTransaction,
  type OutgoingTransaction,
  type SyncTransactionState,
} from './reducers'
import {scheduleOutgoingTransactions} from './scheduleOutgoingTransactions'

const handle = {documentId: 'todo', documentType: 'todo'}
const edit = () => editDocument(handle, {set: {text: 'updated'}})

function transaction(
  id: string,
  actions: Action[] = [edit()],
  disableBatching = false,
): AppliedTransaction {
  return {
    transactionId: id,
    actions,
    disableBatching,
    working: {},
    previous: {},
    base: {},
    previousRevs: {},
    timestamp: new Date().toISOString(),
    outgoingActions: [],
    outgoingMutations: [],
  }
}

describe('scheduleOutgoingTransactions', () => {
  let state: StoreState<SyncTransactionState>
  let subscription: Subscription
  let submissions: {at: number; transaction: OutgoingTransaction}[]

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    submissions = []
    state = createStoreState<SyncTransactionState>({queued: [], applied: [], documentStates: {}})
    subscription = scheduleOutgoingTransactions(state).subscribe((outgoing) => {
      submissions.push({at: Date.now(), transaction: outgoing})
    })
  })

  afterEach(() => {
    subscription.unsubscribe()
    vi.useRealTimers()
  })

  function enqueue(...transactions: AppliedTransaction[]) {
    state.set('apply', (prev) => ({applied: [...prev.applied, ...transactions]}))
  }

  function acknowledge() {
    state.set('acknowledge', {outgoing: undefined})
  }

  it('does not start a batching window from an empty store or queued, unapplied work', async () => {
    state.set('queue', {queued: [{transactionId: 'unresolved', actions: [edit()]}]})
    await vi.advanceTimersByTimeAsync(250)
    expect(submissions).toEqual([])
    enqueue(transaction('first'))
    await vi.advanceTimersByTimeAsync(0)
    expect(submissions.map(({at}) => at)).toEqual([250])
  })

  it('keeps create and publish atomic and submits without a batching delay', async () => {
    enqueue(transaction('create-publish', [createDocument(handle), publishDocument(handle)]))
    await vi.advanceTimersByTimeAsync(0)
    expect(submissions).toHaveLength(1)
    expect(submissions[0].at).toBe(0)
    expect(submissions[0].transaction.actions).toHaveLength(2)
    expect(submissions[0].transaction.disableBatching).toBe(true)
  })

  it('batches subsequent edits at the deadline and submits an edit after idle immediately', async () => {
    enqueue(transaction('first'))
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(100)
    acknowledge()
    enqueue(transaction('second'))
    await vi.advanceTimersByTimeAsync(100)
    enqueue(transaction('third'))
    await vi.advanceTimersByTimeAsync(799)
    expect(submissions).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(submissions[1].at).toBe(1000)
    expect(submissions[1].transaction.batchedTransactionIds).toEqual(['second', 'third'])
    acknowledge()
    await vi.advanceTimersByTimeAsync(1500)
    enqueue(transaction('after-idle'))
    await vi.advanceTimersByTimeAsync(0)
    expect(submissions[2].at).toBe(2500)
  })

  it('waits for an in-flight request and drains immediately when the edit deadline has passed', async () => {
    enqueue(transaction('first'))
    await vi.advanceTimersByTimeAsync(0)
    enqueue(transaction('second'))
    await vi.advanceTimersByTimeAsync(1500)
    expect(submissions).toHaveLength(1)
    acknowledge()
    await vi.advanceTimersByTimeAsync(0)
    expect(submissions.map(({at}) => at)).toEqual([0, 1500])
  })

  it('flushes edits before publish without overtaking them or crossing transaction boundaries', async () => {
    enqueue(transaction('first'))
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(100)
    acknowledge()
    enqueue(transaction('second'), transaction('third'))
    await vi.advanceTimersByTimeAsync(100)
    enqueue(transaction('publish', [publishDocument(handle)]), transaction('after-publish'))
    await vi.advanceTimersByTimeAsync(0)
    expect(submissions[1].at).toBe(200)
    expect(submissions[1].transaction.batchedTransactionIds).toEqual(['second', 'third'])
    acknowledge()
    await vi.advanceTimersByTimeAsync(0)
    expect(submissions[2].at).toBe(200)
    expect(submissions[2].transaction.batchedTransactionIds).toEqual(['publish'])
    acknowledge()
    await vi.advanceTimersByTimeAsync(999)
    expect(submissions).toHaveLength(3)
    await vi.advanceTimersByTimeAsync(1)
    expect(submissions[3].transaction.batchedTransactionIds).toEqual(['after-publish'])
  })

  it('flushes explicitly unbatched edits without starting concurrent requests', async () => {
    enqueue(transaction('first'))
    await vi.advanceTimersByTimeAsync(0)
    enqueue(transaction('explicit', [edit()], true))
    await vi.advanceTimersByTimeAsync(100)
    expect(submissions).toHaveLength(1)
    acknowledge()
    await vi.advanceTimersByTimeAsync(0)
    expect(submissions[1].at).toBe(100)
    expect(submissions[1].transaction.batchedTransactionIds).toEqual(['explicit'])
  })

  it('does not combine edits that use different submission APIs', async () => {
    enqueue(
      transaction('draft'),
      transaction('live', [editDocument({...handle, liveEdit: true}, {set: {text: 'live'}})]),
    )
    await vi.advanceTimersByTimeAsync(0)
    expect(submissions[0].transaction.batchedTransactionIds).toEqual(['draft'])
    acknowledge()
    await vi.advanceTimersByTimeAsync(1000)
    expect(submissions[1].transaction.batchedTransactionIds).toEqual(['live'])
  })

  it('submits an edit followed only by a transaction without actions', async () => {
    enqueue(transaction('edit'), transaction('empty', []))
    await vi.advanceTimersByTimeAsync(0)
    expect(submissions).toHaveLength(1)
    expect(submissions[0].transaction.batchedTransactionIds).toEqual(['edit'])
  })

  it('cancels a scheduled flush if reversion removes the pending work', async () => {
    enqueue(transaction('first'))
    await vi.advanceTimersByTimeAsync(0)
    acknowledge()
    enqueue(transaction('second'))
    await vi.advanceTimersByTimeAsync(100)
    state.set('revert', {applied: []})
    await vi.advanceTimersByTimeAsync(1000)
    expect(submissions).toHaveLength(1)
    enqueue(transaction('after-revert'))
    await vi.advanceTimersByTimeAsync(0)
    expect(submissions[1].at).toBe(1100)
  })

  it('does not send a pending batch after disposal', async () => {
    enqueue(transaction('first'))
    await vi.advanceTimersByTimeAsync(0)
    acknowledge()
    enqueue(transaction('second'))
    subscription.unsubscribe()
    await vi.advanceTimersByTimeAsync(1000)
    expect(submissions).toHaveLength(1)
  })
})
