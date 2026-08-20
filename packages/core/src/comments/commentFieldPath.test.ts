import {describe, expect, it} from 'vitest'

import {toCommentFieldPath} from './commentFieldPath'

describe('toCommentFieldPath', () => {
  it('produces the strings the Studio writes', () => {
    // Golden values. These are the interop contract: a comment the SDK writes is
    // only visible in the Studio if `target.path.field` matches what the Studio
    // would have written for the same field.
    expect(toCommentFieldPath(['title'])).toBe('title')
    expect(toCommentFieldPath(['body', {_key: 'intro'}, 'content'])).toBe(
      'body[_key=="intro"].content',
    )
    expect(toCommentFieldPath(['arr', 0, 'field'])).toBe('arr[0].field')
    expect(toCommentFieldPath(['a', {_key: 'b'}, 'c', 0, 'd'])).toBe('a[_key=="b"].c[0].d')
  })

  it('treats a missing or empty path as document level', () => {
    expect(toCommentFieldPath()).toBe('')
    expect(toCommentFieldPath([])).toBe('')
    expect(toCommentFieldPath('')).toBe('')
  })

  it('canonicalises a string that is already a path', () => {
    expect(toCommentFieldPath('body[_key=="intro"].content')).toBe('body[_key=="intro"].content')
  })

  it('quotes nested field names that GROQ treats as values', () => {
    expect(toCommentFieldPath(['object', 'true'])).toBe('object["true"]')
    expect(toCommentFieldPath(['object', 'false'])).toBe('object["false"]')
    expect(toCommentFieldPath(['object', 'null'])).toBe('object["null"]')
    expect(toCommentFieldPath('object.true')).toBe('object["true"]')
  })

  it('does not rewrite reserved words inside keyed segments', () => {
    expect(toCommentFieldPath(['body', {_key: 'section.true.child'}, 'null'])).toBe(
      'body[_key=="section.true.child"]["null"]',
    )
  })
})
