---
title: Collaboration
---

# Collaboration

Collaboration features let your app take part in the same workflows people already have in Sanity Studio. Today that means comments.

The SDK reads and writes the same comments the Studio shows. A comment hangs off a field of a document, comments with the same `threadId` form a thread, and everything is live: a comment written in the Studio appears in your app without a refetch, and the other way round.

This API is in beta. The hooks are exported from `@sanity/sdk-react`, and the types from both `@sanity/sdk-react` and `@sanity/sdk`.

## Setup

Comments are stored per organization rather than per dataset, so reading or writing one needs an organization id on top of the usual project and dataset. Set it once on your config and every call inherits it:

```tsx
import {type SanityConfig} from '@sanity/sdk-react'

const config: SanityConfig = {
  projectId: 'abc123',
  dataset: 'production',
  collaboration: {organizationId: 'oQCq2WEnk'},
}
```

A per-call `collaboration` wins over the config, the same way `projectId` and `dataset` do:

```tsx
const {threads} = useDocumentComments({
  documentId,
  documentType: 'article',
  collaboration: {organizationId: 'someOtherOrg'},
})
```

Without an organization id, every comment call throws. Writing also requires a logged-in user, since the server records the author.

## Reading a document's comments

`useDocumentComments` returns a document's threads and keeps them up to date. A thread carries its first comment plus its replies, so filtering by `status` or `fieldPath` selects whole threads.

```tsx
import {useDocumentComments} from '@sanity/sdk-react'

function OpenTitleThreads({documentId}: {documentId: string}) {
  const {threads} = useDocumentComments({
    documentId,
    documentType: 'article',
    fieldPath: 'title',
    status: 'open',
  })

  return <span>{threads.length}</span>
}
```

| Option      | Description                                                          |
| ----------- | -------------------------------------------------------------------- |
| `fieldPath` | Narrow to one field. Omit for every comment on the document.         |
| `status`    | `'open'` or `'resolved'`. Omit for both.                             |
| `variants`  | Which versions of the document to pool. Defaults to `'perspective'`. |

`variants` decides which document ids the threads are gathered from:

- `'perspective'` follows what you are viewing — a release shows that release's comments, anything else pools draft and published
- `'drafts'` pools draft and published and ignores releases
- `'exact'` matches only the document id you passed
- `'all'` returns every comment on the document

The hook suspends until the comments have loaded, so wrap it in a Suspense boundary like any other data hook. Switching document or filter happens in a transition instead: the list already on screen stays put and `isPending` goes true.

```tsx
const {threads, isPending} = useDocumentComments({documentId, documentType: 'article'})

return <ul data-pending={isPending}>{threads.map(/* … */)}</ul>
```

Unlike the Studio, the SDK returns every thread it finds. The Studio hides threads whose field has left the schema or is hidden by a conditional, which it can do because it has the schema. Check `fieldPath` yourself if you want the same behaviour.

## Querying comments

`useCommentsQuery` is the escape hatch for anything that is not "comments on this document" — cross-document views, per-user views, organization-wide activity. It takes a GROQ filter, applies `_type == "sanity.comment"` for you, and returns a flat list with replies included.

```tsx
import {useCommentsQuery} from '@sanity/sdk-react'

function Mentions({userId}: {userId: string}) {
  const {comments} = useCommentsQuery({
    filter: 'count(message[].children[_type == "mention" && userId == $userId]) > 0',
    params: {userId},
  })

  return <span>{comments.length}</span>
}
```

Suspense and `isPending` work the same as in `useDocumentComments`.

## Writing comments

`useCommentActions` returns the write actions, bound to the current instance.

```tsx
import {useCommentActions} from '@sanity/sdk-react'

function ResolveButton({commentId}: {commentId: string}) {
  const {setCommentStatus} = useCommentActions()

  return <button onClick={() => setCommentStatus({commentId, status: 'resolved'})}>Resolve</button>
}
```

| Action               | Key options                                       | Notes                                                          |
| -------------------- | ------------------------------------------------- | -------------------------------------------------------------- |
| `createComment`      | document handle, `fieldPath`, `message`, `range?` | Starts a thread. Returns the new `Comment`.                    |
| `replyToComment`     | document handle, `parentCommentId`, `message`     | Replies to a reply join the same thread. Returns the reply.    |
| `updateComment`      | `commentId`, `message`                            | Rewrites the message and marks the comment edited.             |
| `updateCommentRange` | `commentId`, `range`                              | Re-anchors without marking it edited. `null` drops the anchor. |
| `setCommentStatus`   | `commentId`, `status`                             | Pass the thread's first comment; replies follow it.            |
| `removeComment`      | `commentId`                                       | Removes replies too when it starts a thread.                   |
| `addReaction`        | `commentId`, `shortName`                          | Adds the current user's reaction.                              |
| `removeReaction`     | `commentId`, `shortName`                          | Removes the current user's reaction.                           |

`createComment` also takes `commentId` and `threadId` to write against ids you chose, `documentRevisionId` to record which revision the comment was written about, and `context` for free-form data of your own.

### Optimistic writes, and the one exception

Every action writes optimistically: the change shows immediately and rolls back if the server rejects it, so you can render straight from `useDocumentComments` without tracking pending state.

Creating is the exception, and `replyToComment` counts as creating. A comment that fails to post stays on screen carrying `state.createError` rather than disappearing, so nobody loses what they typed. Passing the same `commentId` again retries it:

```tsx
import {type Comment, useCommentActions} from '@sanity/sdk-react'

function Retry({comment}: {comment: Comment}) {
  const {createComment} = useCommentActions()
  if (comment.state?.type !== 'createError') return null

  return (
    <button
      onClick={() =>
        createComment({
          commentId: comment.id,
          threadId: comment.threadId,
          documentId: comment.documentId,
          documentType: comment.documentType,
          fieldPath: comment.fieldPath,
          message: comment.message,
        })
      }
    >
      Retry
    </button>
  )
}
```

### Field paths are required

There is no such thing as a comment on a document as a whole. `fieldPath` accepts a string or a `Path` array, and an empty one throws rather than being written: the Studio's comment inspector crashes on a comment with no path, for everyone looking at that document.

## Messages

A `CommentMessage` is Portable Text — `PortableTextBlock[]` — because that is what the Studio stores. There is no composer helper, so plain text has to be wrapped:

```tsx
import {type CommentMessage} from '@sanity/sdk-react'

function toMessage(text: string): CommentMessage {
  return [
    {
      _type: 'block',
      _key: crypto.randomUUID(),
      style: 'normal',
      markDefs: [],
      children: [{_type: 'span', _key: crypto.randomUUID(), text, marks: []}],
    },
  ]
}
```

Mentions appear in a message as inline objects of type `mention` carrying a `userId`. The SDK stores and returns them untouched, so a mention written in the Studio survives a round trip, but there is no API for composing one yet.

## Inline comments

A comment can be anchored to a run of text inside a Portable Text field. Pass a `range` — an offset into each end of the run — when creating it:

```tsx
createComment({
  documentId,
  documentType: 'article',
  fieldPath: 'body',
  message: toMessage('Tighten this up'),
  range: {start: {_key: 'b1', offset: 0}, end: {_key: 'b1', offset: 12}},
})
```

The API resolves the range and the comment comes back with:

- `selection`, the blocks the comment covers, each carrying the block's entire text with sentinel characters marking where the selection starts and ends. Storing marked-up text rather than offsets is what lets a highlight survive edits elsewhere in the same block.
- `contentSnapshot`, a copy of the content the comment was written about.

Resolving a selection back to a position in a live editor needs the editor's current value, so that lives in `@portabletext/plugin-sdk-value` rather than in the SDK — see [Portable Text Editor](../README.md#portable-text-editor).

When the anchored text moves, re-anchor with `updateCommentRange`. It exists precisely so that a mechanical move does not come back marked as edited:

```tsx
updateCommentRange({commentId, range: {start: {_key, offset: 4}, end: {_key, offset: 16}}})
updateCommentRange({commentId, range: null}) // leaves a field-level comment
```

## Multiple resources and perspectives

The read hooks resolve their resource the way every other hook does: from the options, or from the surrounding `ResourceProvider`.

The actions resolve theirs when the action is called rather than when the hook runs, so one set of callbacks works across several resources:

```tsx
const {createComment} = useCommentActions()

createComment({resourceName: 'secondary', documentId, documentType: 'article', fieldPath, message})
```

Perspective works the same way: pass `perspective` per call, or let the surrounding provider decide.

## Types

Exported from `@sanity/sdk-react` and `@sanity/sdk`:

- `Comment` — a single comment, with `threadId`, `fieldPath`, `status`, `reactions`, and the local-only `state`
- `CommentThread` — a parent comment plus its `replies`, with `commentsCount` and `lastActivityAt`
- `CommentStatus` — `'open' | 'resolved'`
- `CommentMessage` — the Portable Text body
- `CommentRange` and `CommentTextSelection` — the write and read sides of an inline anchor
- `CommentReaction` and `CommentReactionShortName` — reactions, by emoji short name such as `':+1:'`. The set is closed; the API rejects anything else.
- `CommentVariants` — which versions of a document to read comments from
- `CommentLocalState` — why a comment is not yet on the server
