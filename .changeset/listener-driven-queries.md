---
'@sanity/sdk': minor
---

Replace Live Content API subscriptions with mutation listeners for query results and release metadata. Queries now bypass the CDN, including when `useCdn: true` is supplied, because listener notifications do not carry a cache consistency cursor. Dataset mutations refresh every active query, including queries with references, instead of selecting queries by sync tags. This reduces notification latency at the cost of additional query requests. Mutation bursts are coalesced and changes arriving during a fetch trigger a trailing refetch. Failed refreshes retain existing query results and later notifications can recover.
