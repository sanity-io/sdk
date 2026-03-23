import {describe, expect, it} from 'vitest'

import {isDeepEqual, isObject, omitProperty, pickProperties} from './object'

describe('object utils', () => {
  describe('isObject', () => {
    it('returns true for objects and false for primitives', () => {
      expect(isObject({foo: 'bar'})).toBe(true)
      expect(isObject(null)).toBe(false)
      expect(isObject('hello')).toBe(false)
    })
  })

  describe('omitProperty', () => {
    it('removes a property from an object copy', () => {
      expect(omitProperty({foo: 'bar', baz: 1}, 'foo')).toEqual({baz: 1})
    })

    it('returns an empty object for undefined input', () => {
      expect(omitProperty<{foo: string}, 'foo'>(undefined, 'foo')).toEqual({})
    })
  })

  describe('pickProperties', () => {
    it('copies only the requested own properties', () => {
      expect(pickProperties({foo: 'bar', baz: 1}, ['foo'])).toEqual({foo: 'bar'})
    })
  })

  describe('isDeepEqual', () => {
    it('matches nested plain objects and arrays', () => {
      expect(
        isDeepEqual({foo: [{bar: 'baz'}], qux: {count: 2}}, {foo: [{bar: 'baz'}], qux: {count: 2}}),
      ).toBe(true)
    })

    it('returns false for unequal nested plain objects and arrays', () => {
      expect(
        isDeepEqual(
          {foo: [{bar: 'baz'}], qux: {count: 2}},
          {foo: [{bar: 'nope'}], qux: {count: 2}},
        ),
      ).toBe(false)
      expect(isDeepEqual([1, {foo: 'bar'}], [1, {foo: 'baz'}])).toBe(false)
    })

    it('matches sets and maps with equal contents', () => {
      expect(isDeepEqual(new Set([{foo: 'bar'}, 'baz']), new Set(['baz', {foo: 'bar'}]))).toBe(true)

      expect(
        isDeepEqual(
          new Map<string, unknown>([
            ['foo', {bar: 'baz'}],
            ['count', 2],
          ]),
          new Map<string, unknown>([
            ['foo', {bar: 'baz'}],
            ['count', 2],
          ]),
        ),
      ).toBe(true)
    })

    it('compares dates by timestamp', () => {
      expect(isDeepEqual(new Date('2024-01-01'), new Date('2024-01-01'))).toBe(true)
      expect(isDeepEqual(new Date('2024-01-01'), new Date('2024-01-02'))).toBe(false)
    })

    it('compares regular expressions by source and flags', () => {
      expect(isDeepEqual(/foo/gi, /foo/gi)).toBe(true)
      expect(isDeepEqual(/foo/g, /foo/i)).toBe(false)
      expect(isDeepEqual(/foo/g, /bar/g)).toBe(false)
    })

    it('returns false for cross-shape mismatches', () => {
      expect(isDeepEqual({foo: 'bar'}, ['foo', 'bar'] as unknown as {foo: string})).toBe(false)
      expect(
        isDeepEqual(
          new Map<string, unknown>([['foo', 'bar']]) as unknown as object,
          new Set(['foo', 'bar']) as unknown as object,
        ),
      ).toBe(false)
    })

    it('treats non-plain objects as unequal unless they are the same reference', () => {
      class Example {
        constructor(public value: string) {}
      }

      expect(isDeepEqual(new Example('a'), new Example('a'))).toBe(false)
      const instance = new Example('a')
      expect(isDeepEqual(instance, instance)).toBe(true)
    })
  })
})
