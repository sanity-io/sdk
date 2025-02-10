import {makePatches, stringifyPatches} from '@sanity/diff-match-patch'
import {type Mutation, type SanityDocument} from '@sanity/types'
import {describe, expect, it} from 'vitest'

import {diffPatch, type PatchOperations} from './diffPatch'
import {processMutations} from './processMutations'

// A helper “document” that contains the system fields (which will be ignored)
const timestamp = '2025-02-02T00:00:00Z'
const docInfo = {
  _id: 'foo',
  _type: 'author',
  _createdAt: timestamp,
  _updatedAt: timestamp,
  _rev: '1',
}

function applyPatches(before: SanityDocument, patches: PatchOperations[]) {
  const documents = processMutations({
    documents: {[before._id]: before},
    transactionId: 'tx1',
    mutations: patches.map((patch): Mutation => ({patch: {id: before._id, ...patch}})),
    timestamp: timestamp,
  })
  return documents[before._id] as SanityDocument
}

describe('diffPatch', () => {
  it('returns an empty patch if the values are the same', () => {
    const before = {...docInfo, a: 1, b: {c: 'test'}, d: [1, 2]}
    const after = {...docInfo, a: 1, b: {c: 'test'}, d: [1, 2]}
    const patches = diffPatch(before, after)
    expect(patches).toEqual([])
    expect(applyPatches(before, patches)).toEqual(after)
  })

  it('returns a `set` patch if the type of a field changes', () => {
    const before = {...docInfo, a: 1}
    const after = {...docInfo, _rev: 'tx1', a: '1'}
    const patches = diffPatch(before, after)
    expect(patches).toEqual([{set: {a: '1'}}])
    expect(applyPatches(before, patches)).toEqual(after)
  })

  it('returns a `diffMatchPatch` patch if the string in a field changes', () => {
    const before = {...docInfo, text: 'Hello'}
    const after = {...docInfo, _rev: 'tx1', text: 'World'}
    const patches = diffPatch(before, after)

    const expectedPatches = makePatches('Hello', 'World')
    const expectedPatchStr = stringifyPatches(expectedPatches)

    expect(patches).toEqual([{diffMatchPatch: {text: expectedPatchStr}}])
    expect(applyPatches(before, patches)).toEqual(after)
  })

  it('returns a `set` patch if a number in a field changes', () => {
    const before = {...docInfo, num: 5}
    const after = {...docInfo, _rev: 'tx1', num: 10}
    const patches = diffPatch(before, after)
    expect(patches).toEqual([{set: {num: 10}}])
    expect(applyPatches(before, patches)).toEqual(after)
  })

  it('returns a `set` patch if a boolean field changes', () => {
    const before = {...docInfo, bool: true}
    const after = {...docInfo, _rev: 'tx1', bool: false}
    const patches = diffPatch(before, after)
    expect(patches).toEqual([{set: {bool: false}}])
    expect(applyPatches(before, patches)).toEqual(after)
  })

  it('returns a `set` patch if a function field changes', () => {
    // Using a function in `before` and a number in `after` causes a type change.
    const before = {...docInfo, fn: () => 42}
    const after = {...docInfo, _rev: 'tx1', fn: 123}
    const patches = diffPatch(before, after)
    expect(patches).toEqual([{set: {fn: 123}}])
    expect(applyPatches(before, patches)).toEqual(after)
  })

  it('returns an `unset` patch if a field was removed', () => {
    const before = {...docInfo, a: 1, b: 2}
    const after = {...docInfo, _rev: 'tx1', a: 1}
    const patches = diffPatch(before, after)
    expect(patches).toEqual([{unset: ['b']}])
    expect(applyPatches(before, patches)).toEqual(after)
  })

  it('returns a `set` patch for a nested object property addition', () => {
    const before = {...docInfo, nested: {a: 1}}
    const after = {...docInfo, _rev: 'tx1', nested: {a: 1, b: 2}}
    const patches = diffPatch(before, after)
    // Only the new property “nested.b” is added.
    expect(patches).toEqual([{set: {'nested.b': 2}}])
    expect(applyPatches(before, patches)).toEqual(after)
  })

  // Test that changes on keys starting with an underscore are ignored.
  it('ignores internal system fields', () => {
    const before = {...docInfo, _rev: 'foo', a: 1}
    const after = {...docInfo, _rev: 'bar', a: 1}
    const patches = diffPatch(before, after)
    expect(patches).toEqual([])
  })

  it('returns patches for non-keyed arrays when an item is updated and one removed', () => {
    const before = {...docInfo, arr: [1, 2, 3]}
    const after = {...docInfo, _rev: 'tx1', arr: [1, 4]} // index 1 changed from 2→4 and index 2 removed
    const patches = diffPatch(before, after)
    // The diffing logic compares index by index:
    //   At index 0: 1 === 1 → no patch.
    //   At index 1: 2 !== 4 → set patch at "arr[1]".
    //   Then, since before had 3 items and after only 2, index 2 is removed.
    expect(patches).toEqual([{set: {'arr[1]': 4}}, {unset: ['arr[2]']}])
    expect(applyPatches(before, patches)).toEqual(after)
  })

  it('returns an `insert` patch for non-keyed arrays when new items are appended', () => {
    const before = {...docInfo, arr: [1, 2]}
    const after = {...docInfo, _rev: 'tx1', arr: [1, 2, 3, 4]}
    const patches = diffPatch(before, after)
    // Here, the common prefix is at indices 0 and 1.
    // Then the extra items [3,4] are inserted after index 1.
    expect(patches).toEqual([{insert: {after: 'arr[1]', items: [3, 4]}}])
    expect(applyPatches(before, patches)).toEqual(after)
  })

  it('returns an `set` patch for non-keyed arrays when the original array is empty', () => {
    const before = {...docInfo, arr: []}
    const after = {...docInfo, _rev: 'tx1', arr: [1, 2, 3]}
    const patches = diffPatch(before, after)
    // When the before array is empty, the whole array is replaced.
    expect(patches).toEqual([{set: {arr: [1, 2, 3]}}])
    expect(applyPatches(before, patches)).toEqual(after)
  })

  it('returns an `unset` patch if an object item (with `_key`) in an array was removed', () => {
    const before = {
      ...docInfo,
      items: [
        {_key: 'a', val: 1},
        {_key: 'b', val: 2},
      ],
    }
    const after = {
      ...docInfo,
      _rev: 'tx1',
      items: [{_key: 'a', val: 1}],
    }
    const patches = diffPatch(before, after)
    expect(patches).toEqual([{unset: ['items[_key=="b"]']}])
    expect(applyPatches(before, patches)).toEqual(after)
  })

  it('returns an `insert` patch if an object item is added in a keyed array with no items', () => {
    const before = {
      ...docInfo,
      items: [],
    }
    const after = {
      ...docInfo,
      _rev: 'tx1',
      items: [{_key: 'a', val: 1}],
    }
    const patches = diffPatch(before, after)
    expect(applyPatches(before, patches)).toEqual(after)
  })

  it('returns an `insert` patch if an object item is added in a keyed array (insert after)', () => {
    const before = {
      ...docInfo,
      items: [{_key: 'a', val: 1}],
    }
    const after = {
      ...docInfo,
      _rev: 'tx1',
      items: [
        {_key: 'a', val: 1},
        {_key: 'b', val: 2},
      ],
    }
    const patches = diffPatch(before, after)
    expect(patches).toEqual([
      {
        insert: {after: 'items[_key=="a"]', items: [{_key: 'b', val: 2}]},
      },
    ])
    expect(applyPatches(before, patches)).toEqual(after)
  })

  it('returns a diff patch for a nested keyed array item update', () => {
    const before = {
      ...docInfo,
      items: [{_key: 'a', val: 'x'}],
    }
    const after = {
      ...docInfo,
      _rev: 'tx1',
      items: [{_key: 'a', val: 'y'}],
    }
    const patches = diffPatch(before, after)
    const expectedDMP = makePatches('x', 'y')
    const expectedPatchStr = stringifyPatches(expectedDMP)
    // The patch applies to the nested property "val" of the keyed item "a"
    expect(patches).toEqual([{diffMatchPatch: {'items[_key=="a"].val': expectedPatchStr}}])
    expect(applyPatches(before, patches)).toEqual(after)
  })

  // These tests exercise various branches in the keyed array diff logic.
  it('returns an `insert` patch for keyed arrays when a new item is inserted at the beginning (look-ahead branch)', () => {
    const before = {
      ...docInfo,
      items: [{_key: 'b', val: 2}],
    }
    const after = {
      ...docInfo,
      _rev: 'tx1',
      items: [
        {_key: 'a', val: 1},
        {_key: 'b', val: 2},
      ],
    }
    const patches = diffPatch(before, after)
    // At index 0, item "a" is new. Since at j=1 the item "b" exists in before,
    // the new item will be inserted before "b".
    expect(patches).toEqual([
      {
        insert: {before: 'items[_key=="b"]', items: [{_key: 'a', val: 1}]},
      },
    ])
    expect(applyPatches(before, patches)).toEqual(after)
  })

  it('returns an `insert` patch for keyed arrays when all items are new (fallback branch)', () => {
    const before = {
      ...docInfo,
      items: [{_key: 'x', val: 'old'}],
    }
    const after = {
      ...docInfo,
      _rev: 'tx1',
      items: [
        {_key: 'a', val: 'newA'},
        {_key: 'b', val: 'newB'},
      ],
    }
    const patches = diffPatch(before, after)
    expect(patches).toEqual([
      {
        insert: {
          after: 'items[_key=="x"]',
          items: [
            {_key: 'a', val: 'newA'},
            {_key: 'b', val: 'newB'},
          ],
        },
      },
      {unset: ['items[_key=="x"]']},
    ])

    expect(applyPatches(before, patches)).toEqual(after)
  })

  it('returns an `insert` patch for keyed arrays when a new item is inserted in the middle', () => {
    const before = {
      ...docInfo,
      items: [
        {_key: 'a', val: 1},
        {_key: 'b', val: 2},
      ],
    }
    const after = {
      ...docInfo,
      _rev: 'tx1',
      items: [
        {_key: 'a', val: 1},
        {_key: 'x', val: 100},
        {_key: 'b', val: 2},
      ],
    }
    const patches = diffPatch(before, after)
    expect(patches).toEqual([
      {
        insert: {after: 'items[_key=="a"]', items: [{_key: 'x', val: 100}]},
      },
    ])
    expect(applyPatches(before, patches)).toEqual(after)
  })

  it('returns a comprehensive set of patches for keyed arrays with removals, updates, and insertions', () => {
    const before = {
      ...docInfo,
      items: [
        {_key: 'a', val: 1},
        {_key: 'b', val: 2},
        {_key: 'c', val: 3},
      ],
    }
    const after = {
      ...docInfo,
      _rev: 'tx1',
      items: [
        {_key: 'a', val: 1}, // unchanged
        {_key: 'x', val: 100}, // new insertion
        {_key: 'b', val: 22}, // updated value
        // { _key: 'c', ... } is removed
        {_key: 'd', val: 4}, // new insertion
      ],
    }
    const patches = diffPatch(before, after)
    // Expected patches:
    // 1. Removal of key "c"
    // 2. Diff of key "b" (number update: 2 -> 22 yields a set patch)
    // 3. Insertion for the new item with key "x" (inserted after "a")
    // 4. Insertion for the new item with key "d" (inserted after "b")
    expect(patches).toEqual([
      {unset: ['items[_key=="c"]']},
      {set: {'items[_key=="b"].val': 22}},
      {
        insert: {
          after: 'items[_key=="a"]',
          items: [{_key: 'x', val: 100}],
        },
      },
      {
        insert: {
          after: 'items[_key=="b"]',
          items: [{_key: 'd', val: 4}],
        },
      },
    ])
    expect(applyPatches(before, patches)).toEqual(after)
  })
})
