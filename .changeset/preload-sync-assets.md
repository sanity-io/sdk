---
'@sanity/sdk-react': patch
---

Preload only the chunks a federated expose needs to render. Warming async chunks downloaded every lazily imported chunk of a remote, such as syntax highlighting grammars, before anything asked for them.
