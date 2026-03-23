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
