import {describe, expect, it} from 'vitest'

import {MultiKeyWeakMap} from './MultiKeyWeakMap' // Adjust the path if needed

describe('MultiKeyWeakMap', () => {
  it('should set and get a value for a set of keys regardless of order', () => {
    const map = new MultiKeyWeakMap()
    const keyA = {}
    const keyB = {}
    const keyC = {}

    // Set value using one order.
    map.set([keyA, keyB, keyC], 'testValue')

    // Get value with different key orders.
    expect(map.get([keyA, keyB, keyC])).toBe('testValue')
    expect(map.get([keyC, keyB, keyA])).toBe('testValue')
    expect(map.get([keyB, keyC, keyA])).toBe('testValue')
  })

  it('should return undefined for keys that were not set', () => {
    const map = new MultiKeyWeakMap()
    const keyA = {}
    const keyB = {}

    // No value has been set for this combination.
    expect(map.get([keyA, keyB])).toBeUndefined()
  })

  it('should ignore duplicate keys in the key array', () => {
    const map = new MultiKeyWeakMap()
    const keyA = {}
    const keyB = {}

    // Setting with duplicate keys should be equivalent to setting with the unique set.
    map.set([keyA, keyA, keyB], 'duplicateTest')

    // Accessing without duplicates returns the correct value.
    expect(map.get([keyA, keyB])).toBe('duplicateTest')
    expect(map.get([keyB, keyA, keyA])).toBe('duplicateTest')
  })

  it('should allow updating an existing value', () => {
    const map = new MultiKeyWeakMap()
    const keyA = {}
    const keyB = {}

    map.set([keyA, keyB], 'initial')
    expect(map.get([keyA, keyB])).toBe('initial')

    // Update the value for the same key set.
    map.set([keyA, keyB], 'updated')
    expect(map.get([keyA, keyB])).toBe('updated')
  })

  it('should treat different objects as distinct keys', () => {
    const map = new MultiKeyWeakMap()
    const keyA = {}
    const keyB = {}
    const keyA2 = {} // A different object than keyA

    map.set([keyA, keyB], 'first')
    map.set([keyA2, keyB], 'second')

    expect(map.get([keyA, keyB])).toBe('first')
    expect(map.get([keyA2, keyB])).toBe('second')
  })

  it('should return undefined when provided with an empty keys array', () => {
    const map = new MultiKeyWeakMap()
    expect(map.get([])).toBeUndefined()
  })
})
