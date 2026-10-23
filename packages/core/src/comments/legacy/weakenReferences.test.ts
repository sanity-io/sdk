import {describe, expect, it} from 'vitest'

import {weakenReferencesInContentSnapshot} from './weakenReferences'

describe('weakenReferencesInContentSnapshot', () => {
  it('weakens a reference at the top level', () => {
    expect(weakenReferencesInContentSnapshot({_ref: 'abc', _type: 'reference'})).toEqual({
      _ref: 'abc',
      _type: 'reference',
      _weak: true,
    })
  })

  it('weakens references nested in objects and arrays', () => {
    expect(
      weakenReferencesInContentSnapshot({
        title: 'foo',
        author: {_ref: 'bar', _type: 'reference'},
        blocks: [{_key: 'a', tag: {_ref: 'baz', _type: 'reference'}}],
      }),
    ).toEqual({
      title: 'foo',
      author: {_ref: 'bar', _type: 'reference', _weak: true},
      blocks: [{_key: 'a', tag: {_ref: 'baz', _type: 'reference', _weak: true}}],
    })
  })

  it('leaves an already weak reference weak', () => {
    expect(weakenReferencesInContentSnapshot({_ref: 'abc', _weak: true})).toEqual({
      _ref: 'abc',
      _weak: true,
    })
  })

  it('passes primitives and null through', () => {
    expect(weakenReferencesInContentSnapshot('foo')).toBe('foo')
    expect(weakenReferencesInContentSnapshot(42)).toBe(42)
    expect(weakenReferencesInContentSnapshot(null)).toBe(null)
    expect(weakenReferencesInContentSnapshot(undefined)).toBe(undefined)
  })

  it('does not mutate its input', () => {
    const snapshot = {author: {_ref: 'bar'}}
    weakenReferencesInContentSnapshot(snapshot)
    expect(snapshot).toEqual({author: {_ref: 'bar'}})
  })
})
