import {type AppliedTransaction, type OutgoingTransaction} from './documentStore'

export function createOutgoingTransaction([curr, ...rest]: AppliedTransaction[]):
  | OutgoingTransaction
  | undefined {
  if (!curr) return undefined
  if (!curr.actions.length) return createOutgoingTransaction(rest)

  if (curr.actions.length > 1) {
    return {
      transactionId: curr.transactionId,
      actions: curr.actions,
      outgoingActions: curr.outgoingActions,
      shouldBatch: false,
      consumedTransactions: [curr.transactionId],
      previousRevs: curr.previousRevs,
      outgoingMutations: curr.outgoingMutations,
      base: curr.base,
      working: curr.working,
      previous: curr.previous,
    }
  }

  const [action] = curr.actions
  if (action.type !== 'document.edit') {
    return {
      transactionId: curr.transactionId,
      actions: curr.actions,
      outgoingActions: curr.outgoingActions,
      shouldBatch: false,
      consumedTransactions: [curr.transactionId],
      previousRevs: curr.previousRevs,
      outgoingMutations: curr.outgoingMutations,
      base: curr.base,
      working: curr.working,
      previous: curr.previous,
    }
  }

  const editAction: OutgoingTransaction = {
    transactionId: curr.transactionId,
    actions: [action],
    outgoingActions: curr.outgoingActions,
    shouldBatch: true,
    consumedTransactions: [curr.transactionId],
    previousRevs: curr.previousRevs,
    outgoingMutations: curr.outgoingMutations,
    base: curr.base,
    working: curr.working,
    previous: curr.previous,
  }
  if (!rest.length) return editAction

  const tFirst = createOutgoingTransaction(rest)
  if (!tFirst) return undefined
  if (!tFirst.shouldBatch) return editAction

  return {
    shouldBatch: true,
    transactionId: tFirst.transactionId,
    actions: [action, ...tFirst.actions],
    outgoingActions: [...curr.outgoingActions, ...tFirst.outgoingActions],
    consumedTransactions: [curr.transactionId, ...tFirst.consumedTransactions],
    outgoingMutations: [...curr.outgoingMutations, ...tFirst.outgoingMutations],
    working: {...curr.working, ...tFirst.working},
    previousRevs: {...tFirst.previousRevs, ...curr.previousRevs},
    previous: {...tFirst.previous, ...curr.previous},
    base: {...tFirst.base, ...curr.base},
  }
}
