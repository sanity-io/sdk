import {test} from 'vitest'

import {type SanityInstance} from '../store/createSanityInstance'
import {createComment, updateCommentRange} from './commentActions'

const instance = {} as SanityInstance

const HANDLE = {documentId: 'doc-1', documentType: 'author', fieldPath: 'body'}
const MESSAGE = [{_type: 'block', _key: 'm1', children: [{_type: 'span', text: 'hi'}]}]
const RANGE = {start: {_key: 'b1', offset: 0}, end: {_key: 'b1', offset: 5}}
const FIELD_VALUE = [{_type: 'block', _key: 'b1', children: [{_type: 'span', text: 'hi'}]}]

test('createComment — takes blocks to resolve a range against', () => {
  void createComment(instance, {
    ...HANDLE,
    message: MESSAGE,
    range: RANGE,
    fieldValue: FIELD_VALUE,
  })
})

test('createComment — refuses blocks with no range to resolve', () => {
  // The API resolves a `fieldValue` through the range that counts into it, so
  // one on its own describes nothing.
  // @ts-expect-error fieldValue requires range
  void createComment(instance, {...HANDLE, message: MESSAGE, fieldValue: FIELD_VALUE})
})

test('updateCommentRange — takes a range, none, or none at all', () => {
  void updateCommentRange(instance, {commentId: 'c1', range: RANGE, fieldValue: FIELD_VALUE})
  void updateCommentRange(instance, {commentId: 'c1', range: null})
  void updateCommentRange(instance, {commentId: 'c1'})
})

test('updateCommentRange — refuses blocks when the anchor is being dropped', () => {
  // @ts-expect-error fieldValue cannot accompany a dropped range
  void updateCommentRange(instance, {commentId: 'c1', range: null, fieldValue: FIELD_VALUE})
})
