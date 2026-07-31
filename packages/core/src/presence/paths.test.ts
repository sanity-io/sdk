import {type Path} from '@sanity/types'
import {describe, expect, it} from 'vitest'

import {startsWithPath} from './paths'

describe('startsWithPath', () => {
  it('treats the empty path as a prefix of everything, which is the document root', () => {
    expect(startsWithPath([], ['title'])).toBe(true)
    expect(startsWithPath([], [])).toBe(true)
  })

  it('matches a path against itself', () => {
    expect(startsWithPath(['title'], ['title'])).toBe(true)
  })

  it('matches a descendant', () => {
    expect(startsWithPath(['body'], ['body', 'children'])).toBe(true)
  })

  it('does not match an ancestor, since a longer prefix cannot fit', () => {
    expect(startsWithPath(['body', 'children'], ['body'])).toBe(false)
  })

  it('does not match a sibling', () => {
    expect(startsWithPath(['title'], ['subtitle'])).toBe(false)
  })

  it('does not match a partial segment name', () => {
    // `title` must not be treated as a prefix of `titleImage`.
    expect(startsWithPath(['title'], ['titleImage'])).toBe(false)
  })

  it('compares keyed segments by key rather than by identity', () => {
    // Distinct objects with the same key, which is what arrives over the wire.
    expect(startsWithPath(['cast', {_key: 'a'}], ['cast', {_key: 'a'}, 'name'])).toBe(true)
    expect(startsWithPath(['cast', {_key: 'a'}], ['cast', {_key: 'b'}, 'name'])).toBe(false)
  })

  it('does not confuse a keyed segment with a string or a number', () => {
    expect(startsWithPath([{_key: 'a'}], ['a'])).toBe(false)
    expect(startsWithPath(['a'], [{_key: 'a'}])).toBe(false)
    expect(startsWithPath([{_key: '0'}], [0])).toBe(false)
  })

  it('compares numeric indexes', () => {
    expect(startsWithPath(['awards', 0], ['awards', 0])).toBe(true)
    expect(startsWithPath(['awards', 0], ['awards', 1])).toBe(false)
  })

  it('compares index tuples structurally', () => {
    const prefix: Path = ['body', [0, 2]]
    expect(startsWithPath(prefix, ['body', [0, 2], 'children'])).toBe(true)
    expect(startsWithPath(prefix, ['body', [0, 3]])).toBe(false)
    expect(startsWithPath(prefix, ['body', [0, '']])).toBe(false)
  })

  it('does not confuse a tuple with a keyed segment', () => {
    expect(startsWithPath([[0, 2]], [{_key: 'a'}])).toBe(false)
    expect(startsWithPath([{_key: 'a'}], [[0, 2]])).toBe(false)
  })

  it('handles a realistic Portable Text span path', () => {
    const field: Path = ['body']
    const span: Path = ['body', {_key: 'block-1'}, 'children', {_key: 'span-1'}, 'text']

    expect(startsWithPath(field, span)).toBe(true)
    expect(startsWithPath(['title'], span)).toBe(false)
    expect(startsWithPath(['body', {_key: 'block-2'}], span)).toBe(false)
  })
})
