import {test} from 'vitest'

import {type SanityInstance} from '../store/createSanityInstance'
import {createComment, updateCommentAnchor} from './commentActions'

const instance = {} as SanityInstance

const HANDLE = {documentId: 'doc-1', documentType: 'author', fieldPath: 'body'}
const MESSAGE = [{_type: 'block', _key: 'm1', children: [{_type: 'span', text: 'hi'}]}]
const ANCHOR = {
  type: 'portable-text',
  start: {_key: 'b1', offset: 0},
  end: {_key: 'b1', offset: 5},
} as const
const FIELD_VALUE = [{_type: 'block', _key: 'b1', children: [{_type: 'span', text: 'hi'}]}]

test('createComment — takes an anchor, with or without blocks to resolve it against', () => {
  void createComment(instance, {...HANDLE, message: MESSAGE, anchor: ANCHOR})
  void createComment(instance, {
    ...HANDLE,
    message: MESSAGE,
    anchor: {...ANCHOR, fieldValue: FIELD_VALUE},
  })
  void createComment(instance, {...HANDLE, message: MESSAGE})
})

test('createComment — refuses blocks with no anchor to resolve', () => {
  // The API resolves a `fieldValue` through the anchor that counts into it, so
  // one on its own describes nothing. It belongs to the anchor, not the call.
  // @ts-expect-error fieldValue lives on the anchor
  void createComment(instance, {...HANDLE, message: MESSAGE, fieldValue: FIELD_VALUE})
})

test('createComment — refuses the deprecated range', () => {
  // @ts-expect-error range was replaced by anchor
  void createComment(instance, {...HANDLE, message: MESSAGE, range: ANCHOR})
})

test('createComment — refuses an anchor that does not say what it anchors into', () => {
  void createComment(instance, {
    ...HANDLE,
    message: MESSAGE,
    // @ts-expect-error anchor requires a type
    anchor: {start: ANCHOR.start, end: ANCHOR.end},
  })
})

test('updateCommentAnchor — takes an anchor, none, or none at all', () => {
  void updateCommentAnchor(instance, {
    commentId: 'c1',
    anchor: {...ANCHOR, fieldValue: FIELD_VALUE},
  })
  void updateCommentAnchor(instance, {commentId: 'c1', anchor: null})
  void updateCommentAnchor(instance, {commentId: 'c1'})
})

test('updateCommentAnchor — refuses blocks when the anchor is being dropped', () => {
  // @ts-expect-error fieldValue cannot accompany a dropped anchor
  void updateCommentAnchor(instance, {commentId: 'c1', anchor: null, fieldValue: FIELD_VALUE})
})
