---
'@sanity/sdk': minor
---

Keep local edits when saving them fails with a 401 (for example an expired session), a 408, 429 or 5xx response, a 409 transaction conflict from contention while committing, or a dropped connection. The document store now resubmits the same transaction with backoff, and right away when the credentials change, instead of reverting the edits. Each failed attempt emits a `submission-failed` document event, and `getDocumentSyncStatus` reports the document as not in sync until the transaction is saved. Transactions the server rejects, such as a 400, a 403 or a revision conflict, are still reverted.
