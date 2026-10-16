import {type CollaborationCommentMessage} from '@sanity/client'

import {type CommentMessage} from './types'

/**
 * `@sanity/client` and `@sanity/types` each describe a Portable Text block, and
 * the two are not assignable to each other in either direction: the client's
 * block requires `children` and allows any other key, while `@sanity/types`
 * requires `_key` and splits blocks from inline objects. The runtime shape is
 * the same Portable Text either way.
 *
 * The SDK speaks `@sanity/types`, because that is what the rest of it speaks and
 * what a Portable Text editor hands you. These two conversions are where that
 * meets the wire, and they are the only place either cast is allowed. Neither
 * type is even comparable to the other, hence the trip through `unknown`.
 *
 * @internal
 */
export function toStoredMessage(message: CommentMessage): CollaborationCommentMessage {
  return message as unknown as CollaborationCommentMessage
}

/** @internal */
export function toCommentMessage(message: CollaborationCommentMessage): CommentMessage {
  return message as unknown as CommentMessage
}
