---
'@sanity/sdk': minor
'@sanity/sdk-react': patch
---

Comment lists now share one listener per organization instead of opening one each. Which of its comments belong in which list is answered locally, by matching the list's own GROQ filter against the comment the listener carried.

`useCommentsQuery` gains optimistic creates and replies as a result. A new comment that answers the filter appears before the server confirms it, as it already did on `useComments` and `useCommentThreads`, and a failed create stays on screen carrying `state.createError` so it can be retried. Only filters built from known-safe GROQ can be matched against a single comment. A filter that dereferences with `->`, runs a `*[...]` of its own, or calls a context-dependent function such as `sanity::dataset()`, `releases::all()` or `now()` behaves as before: it follows the server and keeps a listener of its own.
