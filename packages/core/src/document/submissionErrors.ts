import {ClientError, CorsOriginError} from '@sanity/client'

/**
 * What the document store does with an outgoing transaction whose submission
 * failed.
 *
 * - `retry`: the failure is about the connection, the credentials or
 *   contention on the server, not the transaction. Keep the transaction and
 *   its optimistic local state, and submit it again.
 * - `accepted`: the server already recorded this transaction ID, so an earlier
 *   attempt was committed even though its response never arrived.
 * - `revert`: the server rejected the transaction itself. Submitting it again
 *   cannot succeed, so drop it and rebuild local state from the server copy.
 *
 * @internal
 */
export type SubmissionErrorClass = 'retry' | 'accepted' | 'revert'

// Mirrors Studio's `TERMINAL_COMMIT_STATUSES` (checkoutPair.ts) without 401. A
// 401 rejects the credentials (usually an expired session), not the
// transaction, so the same transaction succeeds once the user re-authenticates.
const REJECTED_TRANSACTION_STATUS_CODES = new Set([400, 402, 403, 404, 409, 410, 412, 413, 422])

function getErrorType(error: ClientError): unknown {
  const details: unknown = error.details
  if (details && typeof details === 'object' && 'type' in details) return details.type
  return undefined
}

/**
 * Classifies a failed transaction submission. Unknown failures (network
 * errors, timeouts, 5xx and 429 responses, and anything that is not a
 * `ClientError`) default to `retry`: wrongly retrying a rejected transaction
 * leaves the document visibly unsynced with the edits still on screen, while
 * wrongly reverting a transient failure silently discards the user's work.
 *
 * @internal
 */
export function classifySubmissionError(error: unknown): SubmissionErrorClass {
  if (error instanceof CorsOriginError) return 'revert'
  if (!(error instanceof ClientError)) return 'retry'
  if (error.statusCode === 409) {
    const errorType = getErrorType(error)
    if (errorType === 'transactionAlreadyExistsError') return 'accepted'
    // contention while committing, not a verdict on the transaction; the
    // server rolled it back, so the same transaction ID is safe to resend
    if (errorType === 'transactionConflictError') return 'retry'
  }
  if (REJECTED_TRANSACTION_STATUS_CODES.has(error.statusCode)) return 'revert'
  return 'retry'
}
