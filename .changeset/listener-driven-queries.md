---
'@sanity/sdk': minor
'@sanity/sdk-react': patch
---

Replace Live Content API subscriptions with mutation listeners for query results and release metadata. Queries now bypass the CDN, including when the deprecated `useCdn: true` option is supplied, because listener notifications do not carry a cache consistency cursor. Dataset mutations refresh every active query, including queries with references, instead of selecting queries by sync tags. This reduces notification latency at the cost of additional query requests. Mutation bursts are coalesced and changes arriving during a fetch trigger a trailing refetch. Failed refreshes retain existing query results and later notifications can recover.

The initial listener welcome can trigger an additional refresh to catch writes between the first fetch and listener establishment. Draft edits also invalidate every active query, so continuous editing can cause repeated query requests even when their results do not change.
