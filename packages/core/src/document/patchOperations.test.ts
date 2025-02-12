import {describe, expect, it} from 'vitest'

import {
  dec,
  diffMatchPatch,
  ensureArrayKeysDeep,
  getDeep,
  getIndexForKey,
  ifRevisionID,
  inc,
  insert,
  jsonMatch,
  parsePath,
  set,
  setDeep,
  setIfMissing,
  stringifyPath,
  unset,
  unsetDeep,
} from './patchOperations'

describe('parsePath', () => {
  it('parses an empty string into an empty path', () => {
    expect(parsePath('')).toEqual([])
  })

  it('parses simple dot notation (simple descent)', () => {
    expect(parsePath('friend.name')).toEqual(['friend', 'name'])
  })

  it('parses a single property', () => {
    expect(parsePath('foo')).toEqual(['foo'])
  })

  it('parses a property with a single numeric index', () => {
    expect(parsePath('items[0]')).toEqual(['items', 0])
  })

  it('parses a property with a negative index', () => {
    expect(parsePath('items[-1]')).toEqual(['items', -1])
  })

  it('parses a property with a keyed segment using double quotes', () => {
    expect(parsePath('items[_key=="value"]')).toEqual(['items', {_key: 'value'}])
  })

  it('parses a property with a keyed segment using single quotes', () => {
    expect(parsePath("items[_key=='value']")).toEqual(['items', {_key: 'value'}])
  })

  it('parses an array range that selects the whole thing (e.g. [:])', () => {
    expect(parsePath('array[:]')).toEqual(['array', ['', '']])
  })

  it('parses an array range with both start and end (e.g. [1:9])', () => {
    expect(parsePath('array[1:9]')).toEqual(['array', [1, 9]])
  })

  it('parses an array range with missing end (e.g. [4:])', () => {
    expect(parsePath('array[4:]')).toEqual(['array', [4, '']])
  })

  it('parses an array range with missing start (e.g. [:4])', () => {
    expect(parsePath('array[:4]')).toEqual(['array', ['', 4]])
  })

  it('parses multiple bracket expressions in one segment', () => {
    expect(parsePath('foo[1][_key=="bar"][2:9]')).toEqual(['foo', 1, {_key: 'bar'}, [2, 9]])
  })

  it('parses segments that mix dot and bracket notation', () => {
    // "a.b[0].c" splits into: ["a"] + parseSegment("b[0]") + ["c"] → ["a", "b", 0, "c"]
    expect(parsePath('a.b[0].c')).toEqual(['a', 'b', 0, 'c'])
  })

  it('parses a segment with text before and after a bracket expression', () => {
    // "foo[1]bar" → ["foo", 1, "bar"]
    expect(parsePath('foo[1]bar')).toEqual(['foo', 1, 'bar'])
  })

  it('parses a segment that is only a bracket expression', () => {
    expect(parsePath('[0]')).toEqual([0])
  })

  it('parses a segment that consists solely of bracket expressions', () => {
    // "[1][_key=="a"]" → [1, { _key: "a" }]
    expect(parsePath('[1][_key=="a"]')).toEqual([1, {_key: 'a'}])
  })

  it('ignores a trailing dot', () => {
    // "foo." → ["foo"]
    expect(parsePath('foo.')).toEqual(['foo'])
  })

  it('ignores a leading dot', () => {
    // ".foo" → ["foo"]
    expect(parsePath('.foo')).toEqual(['foo'])
  })

  it('throws an error when a bracket is not closed', () => {
    expect(() => parsePath('foo[1')).toThrowError('Unmatched "[" in segment: "foo[1"')
  })

  it('throws an error when bracket content is invalid', () => {
    expect(() => parsePath('a[invalid]')).toThrowError('Invalid bracket content: “[invalid]”')
  })
})

describe('stringifyPath', () => {
  it('stringifies a single string segment', () => {
    expect(stringifyPath(['foo'])).toBe('foo')
  })

  it('stringifies multiple string segments using dot notation', () => {
    expect(stringifyPath(['friend', 'name'])).toBe('friend.name')
  })

  it('stringifies a path with a single numeric index', () => {
    expect(stringifyPath(['items', 0])).toBe('items[0]')
  })

  it('stringifies a path with a negative index', () => {
    expect(stringifyPath(['items', -1])).toBe('items[-1]')
  })

  it('stringifies a keyed segment', () => {
    expect(stringifyPath(['items', {_key: 'value'}])).toBe('items[_key=="value"]')
  })

  it('stringifies an array range with both start and end', () => {
    expect(stringifyPath(['array', [1, 9]])).toBe('array[1:9]')
  })

  it('stringifies an array range with missing end', () => {
    expect(stringifyPath(['array', [4, '']])).toBe('array[4:]')
  })

  it('stringifies an array range with missing start', () => {
    expect(stringifyPath(['array', ['', 4]])).toBe('array[:4]')
  })

  it('stringifies an array range with both start and end missing (i.e. ":")', () => {
    expect(stringifyPath(['array', ['', '']])).toBe('array[:]')
  })

  it('stringifies a complex combination of segments', () => {
    // ["foo", 1, { _key: "bar" }, [2, 9]] → "foo[1][_key=="bar"][2:9]"
    expect(stringifyPath(['foo', 1, {_key: 'bar'}, [2, 9]])).toBe('foo[1][_key=="bar"][2:9]')
  })

  it('stringifies a path that starts with a non-string segment', () => {
    // [0, "foo"] → "[0].foo"
    expect(stringifyPath([0, 'foo'])).toBe('[0].foo')
  })

  it('stringifies consecutive non-string segments without adding extra dots', () => {
    // [0, -1] → "[0][-1]"
    expect(stringifyPath([0, -1])).toBe('[0][-1]')
  })

  it('stringifies an empty path as an empty string', () => {
    expect(stringifyPath([])).toBe('')
  })
})

describe('getIndexForKey', () => {
  it('returns undefined when input is not an array', () => {
    expect(getIndexForKey(null, 'a')).toBeUndefined()
    expect(getIndexForKey(123, 'a')).toBeUndefined()
    expect(getIndexForKey('string', 'a')).toBeUndefined()
    expect(getIndexForKey({}, 'a')).toBeUndefined()
  })

  it('returns undefined when given an empty array', () => {
    const arr: unknown[] = []
    expect(getIndexForKey(arr, 'any')).toBeUndefined()
  })

  it('returns undefined when array items do not have a _key property', () => {
    const arr = [{notKey: 'a'}, {foo: 'bar'}]
    expect(getIndexForKey(arr, 'a')).toBeUndefined()
  })

  it('returns the correct index for keyed segments', () => {
    const arr = [{_key: 'a'}, {_key: 'b'}, {_key: 'c'}]
    expect(getIndexForKey(arr, 'a')).toBe(0)
    expect(getIndexForKey(arr, 'b')).toBe(1)
    expect(getIndexForKey(arr, 'c')).toBe(2)
  })

  it('returns undefined when the key is not found in the array', () => {
    const arr = [{_key: 'a'}, {_key: 'b'}]
    expect(getIndexForKey(arr, 'c')).toBeUndefined()
  })

  it('returns the index for the last occurrence when duplicate keys exist', () => {
    const arr = [{_key: 'dup'}, {_key: 'dup'}]
    // Because the lookup overwrites earlier values,
    // the index for "dup" should be the index of the last occurrence.
    expect(getIndexForKey(arr, 'dup')).toBe(1)
  })

  it('ignores items that are not objects or that lack a _key property', () => {
    const arr = [{_key: 'a'}, 42, 'hello', {_key: 'b'}]
    expect(getIndexForKey(arr, 'a')).toBe(0)
    expect(getIndexForKey(arr, 'b')).toBe(3)
    // Even though 42 and "hello" are in the array, they are ignored.
    expect(getIndexForKey(arr, '42')).toBeUndefined()
  })

  it('caches the index lookup even if the array is mutated after the first call', () => {
    const arr = [{_key: 'a'}, {_key: 'b'}]
    // First call creates the cache.
    expect(getIndexForKey(arr, 'a')).toBe(0)
    // Mutate the array element _key.
    arr[0]._key = 'changed'
    // The cache still returns the original index for "a"
    expect(getIndexForKey(arr, 'a')).toBe(0)
    // Lookup for the new key is undefined because it was not in the original lookup.
    expect(getIndexForKey(arr, 'changed')).toBeUndefined()
  })
})

describe('jsonMatch', () => {
  it('returns the input when the path expression is empty', () => {
    const input = 42
    const result = jsonMatch(input, '')
    expect(result).toEqual([{value: 42, path: []}])
  })

  it('matches object properties (simple descent)', () => {
    const input = {friend: {name: 'Alice'}}
    const result = jsonMatch(input, 'friend.name')
    expect(result).toEqual([{value: 'Alice', path: ['friend', 'name']}])
  })

  it('returns a match with undefined for a missing property', () => {
    const input = {friend: {}}
    const result = jsonMatch(input, 'friend.name')
    // Even though friend.name does not exist, the match is returned with value undefined.
    expect(result).toEqual([{value: undefined, path: ['friend', 'name']}])
  })

  it('matches an array element by a positive numeric index', () => {
    const input = [10, 20, 30]
    const result = jsonMatch(input, '[1]')
    expect(result).toEqual([{value: 20, path: [1]}])
  })

  it('matches an array element by a negative numeric index', () => {
    const input = [10, 20, 30]
    const result = jsonMatch(input, '[-1]')
    expect(result).toEqual([{value: 30, path: [-1]}])
  })

  it('returns no match when a numeric index is used on a non-array', () => {
    const input = {not: 'an array'}
    const result = jsonMatch(input, '[1]')
    expect(result).toEqual([])
  })

  it('matches multiple elements using an index tuple (range) with both start and end', () => {
    const input = ['a', 'b', 'c', 'd', 'e']
    const result = jsonMatch(input, '[1:4]')
    // The range [1:4] will match indices 1, 2, and 3.
    expect(result).toEqual([
      {value: 'b', path: [1]},
      {value: 'c', path: [2]},
      {value: 'd', path: [3]},
    ])
  })

  it('matches a range with a missing start ([:3])', () => {
    const input = ['a', 'b', 'c', 'd']
    const result = jsonMatch(input, '[:3]')
    // Missing start means start at index 0.
    expect(result).toEqual([
      {value: 'a', path: [0]},
      {value: 'b', path: [1]},
      {value: 'c', path: [2]},
    ])
  })

  it('matches a range with a missing end ([2:])', () => {
    const input = ['a', 'b', 'c', 'd', 'e']
    const result = jsonMatch(input, '[2:]')
    // Missing end means go until the end of the array.
    expect(result).toEqual([
      {value: 'c', path: [2]},
      {value: 'd', path: [3]},
      {value: 'e', path: [4]},
    ])
  })

  it('returns no match for an index tuple when the input is not an array', () => {
    const input = {not: 'an array'}
    const result = jsonMatch(input, '[1:3]')
    expect(result).toEqual([])
  })

  it('matches an element in an array by keyed segment', () => {
    const input = [{_key: 'bar'}, {_key: 'foo'}, {_key: 'baz'}]
    const result = jsonMatch(input, '[_key=="foo"]')
    expect(result).toEqual([{value: {_key: 'foo'}, path: [1]}])
  })

  it('returns no match for a keyed segment when the input is not an array', () => {
    const input = {_key: 'foo'}
    const result = jsonMatch(input, '[_key=="foo"]')
    expect(result).toEqual([])
  })

  it('returns no match for a keyed segment when the key is not found', () => {
    const input = [{_key: 'a'}]
    const result = jsonMatch(input, '[_key=="b"]')
    expect(result).toEqual([])
  })

  it('matches a complex nested structure with a range and negative index', () => {
    const input = {
      friends: [
        {name: 'Alice', scores: [10, 20, 30]},
        {name: 'Bob', scores: [15, 25, 35]},
        {name: 'Charlie', scores: [20, 30, 40]},
      ],
    }
    const result = jsonMatch(input, 'friends[0:2].scores[-1]')
    // For friends[0:2], the range selects friend indices 0 and 1.
    // For each friend, scores[-1] picks the last element in the scores array.
    expect(result).toEqual([
      {value: 30, path: ['friends', 0, 'scores', -1]},
      {value: 35, path: ['friends', 1, 'scores', -1]},
    ])
  })

  it('returns no match when trying to access a property on a non-object', () => {
    const input = {name: 'John'}
    // Here, "name" is a string so it does not have a property "first"
    const result = jsonMatch(input, 'name.first')
    expect(result).toEqual([])
  })

  it('returns a match with undefined for an out-of-bound numeric index', () => {
    const input = [1, 2, 3]
    // Index 5 is out of bounds; .at(5) returns undefined.
    const result = jsonMatch(input, '[5]')
    expect(result).toEqual([{value: undefined, path: [5]}])
  })

  it('returns an empty match for an index tuple with an empty range', () => {
    const input = ['a', 'b']
    // A range like [2:2] selects no indices.
    const result = jsonMatch(input, '[2:2]')
    expect(result).toEqual([])
  })
})

describe('getDeep', () => {
  it('returns the input when the path is empty', () => {
    const input = {a: 1, b: 2}
    expect(getDeep(input, [])).toEqual(input)
  })

  it('returns undefined when input is not an object', () => {
    expect(getDeep(42, ['foo'])).toBeUndefined()
    expect(getDeep('string', ['foo'])).toBeUndefined()
  })

  it('returns undefined when input is null', () => {
    expect(getDeep(null, ['foo'])).toBeUndefined()
  })

  it('retrieves a nested property from an object', () => {
    const input = {a: {b: 'hello'}}
    expect(getDeep(input, ['a', 'b'])).toBe('hello')
  })

  it('retrieves an element from an array using a numeric index', () => {
    const input = [10, 20, 30]
    expect(getDeep(input, [1])).toBe(20)
  })

  it('retrieves an element from an array using a negative numeric index', () => {
    const input = [10, 20, 30]
    expect(getDeep(input, [-1])).toBe(30)
  })

  it('retrieves a nested property from an array element', () => {
    const input = [{a: 1}, {a: 2}]
    expect(getDeep(input, [1, 'a'])).toBe(2)
  })

  it('returns undefined if a property does not exist', () => {
    const input = {a: {}}
    expect(getDeep(input, ['a', 'nonexistent'])).toBeUndefined()
  })

  it('retrieves a value using a keyed segment in an array', () => {
    const input = [
      {_key: 'foo', value: 99},
      {_key: 'bar', value: 88},
    ]
    expect(getDeep(input, [{_key: 'bar'}, 'value'])).toBe(88)
  })

  it('returns undefined if a segment object is not a keyed segment', () => {
    const input = [{foo: 'notAKeyedSegment'}]
    expect(getDeep(input, ['foo'])).toBeUndefined()
  })
})

describe('setDeep', () => {
  it('returns the new value when the path is empty', () => {
    expect(setDeep({a: 1}, [], 42)).toBe(42)
  })

  it('creates an object property if input is not an object and the path segment is a string', () => {
    const result = setDeep(42, ['foo'], 'bar')
    expect(result).toEqual({foo: 'bar'})
  })

  it('creates an array element when input is not an object and the path segment is a keyed segment', () => {
    const result = setDeep(undefined, [{_key: 'a'}], 'y')
    expect(result).toEqual(['y'])
  })

  it('updates an existing array element by numeric index', () => {
    const input = [1, 2, 3]
    const result = setDeep(input, [1], 42)
    expect(result).toEqual([1, 42, 3])
  })

  it('expands an array when setting an element out-of-bounds', () => {
    const input = [1, 2]
    const result = setDeep(input, [4], 42)
    expect(result).toEqual([1, 2, null, null, 42])
  })

  it('updates an existing array element by negative numeric index', () => {
    const input = [1, 2, 3]
    const result = setDeep(input, [-1], 42)
    expect(result).toEqual([1, 2, 42])
  })

  it('updates a nested property in an object', () => {
    const input = {a: {b: 1}}
    const result = setDeep(input, ['a', 'b'], 2)
    expect(result).toEqual({a: {b: 2}})
  })

  it('creates a nested property in an object if it does not exist', () => {
    const input = {a: {}}
    const result = setDeep(input, ['a', 'c'], 10)
    expect(result).toEqual({a: {c: 10}})
  })

  it('returns input unchanged when the current path segment is an object that is not a keyed segment', () => {
    const input = {a: 1}
    const nonKeyObject = {foo: 'bar'}
    const result = setDeep(
      input,
      [
        // @ts-expect-error testing invalid input
        nonKeyObject,
      ],
      999,
    )
    expect(result).toEqual(input)
  })

  it('returns input unchanged in arrays when the current path segment is an object that is not a keyed segment', () => {
    const input = [{a: 1}]
    const nonKeyObject = {foo: 'bar'}
    const result = setDeep(
      input,
      [
        'a',
        // @ts-expect-error testing invalid input
        nonKeyObject,
      ],
      999,
    )
    expect(result).toEqual(input)
  })

  it('returns input unchanged when a negative index is used with a non-array input', () => {
    const input = 'not an object'
    const result = setDeep(input, [-1], 10)
    expect(result).toBe(input)
  })

  it('updates an array element using a keyed segment', () => {
    const input = [
      {_key: 'foo', value: 1},
      {_key: 'bar', value: 2},
    ]
    const result = setDeep(input, [{_key: 'bar'}, 'value'], 42)
    expect(result).toEqual([
      {_key: 'foo', value: 1},
      {_key: 'bar', value: 42},
    ])
  })
})

describe('unsetDeep', () => {
  it('returns the input when the path is empty', () => {
    const input = {a: 1}
    expect(unsetDeep(input, [])).toEqual(input)
  })

  it('returns the input when the path contains an invalid object key', () => {
    const input = {a: 1}
    expect(
      unsetDeep(input, [
        // @ts-expect-error testing invalid input
        {notAKey: 'foo'},
      ]),
    ).toEqual(input)
  })

  it('returns the input unchanged when input is not an object', () => {
    expect(unsetDeep(42, ['foo'])).toBe(42)
    expect(unsetDeep('hello', ['foo'])).toBe('hello')
  })

  it('returns the input unchanged when input is null', () => {
    expect(unsetDeep(null, ['foo'])).toBe(null)
  })

  it('removes a property from an object', () => {
    const input = {a: 1, b: 2}
    const result = unsetDeep(input, ['a'])
    expect(result).toEqual({b: 2})
  })

  it('removes a nested property from an object', () => {
    const input = {a: {b: 1, c: 2}, b: 3}
    const result = unsetDeep(input, ['a', 'b'])
    expect(result).toEqual({a: {c: 2}, b: 3})
  })

  it('removes an element from an array by numeric index', () => {
    const input = [10, 20, 30]
    const result = unsetDeep(input, [1])
    expect(result).toEqual([10, 30])
  })

  it('returns the input unchanged if the property does not exist', () => {
    const input = {a: 1}
    const result = unsetDeep(input, ['b'])
    expect(result).toEqual(input)
  })

  it('removes a nested property from an array element', () => {
    const input = [{a: 1}, {a: 2}]
    const result = unsetDeep(input, [0, 'a'])
    expect(result).toEqual([{}, {a: 2}])
  })

  it('unsets an element from an array using a keyed segment', () => {
    const input = [
      {_key: 'foo', value: 1},
      {_key: 'bar', value: 2},
    ]
    const result = unsetDeep(input, [{_key: 'bar'}])
    expect(result).toEqual([{_key: 'foo', value: 1}])
  })

  it('supports negative indexes in arrays', () => {
    const input = [10, 20, 30]
    const result = unsetDeep(input, [-1])
    expect(result).toEqual([10, 20])
  })
})

describe('set', () => {
  it('sets a single property using a simple path expression', () => {
    const input = {name: {first: '', last: ''}}
    const output = set(input, {'name.first': 'changed'})
    expect(output).toEqual({name: {first: 'changed', last: ''}})
  })

  it('sets multiple properties when multiple path expressions are provided', () => {
    const input = {a: {b: 1, c: 2}}
    const output = set(input, {'a.b': 10, 'a.c': 20})
    expect(output).toEqual({a: {b: 10, c: 20}})
  })

  it('updates multiple array elements when the path expression matches a range', () => {
    const input = {items: [1, 2, 3, 4]}
    const output = set(input, {'items[1:3]': 100})
    expect(output).toEqual({items: [1, 100, 100, 4]})
  })

  it('updates an array element using a keyed segment', () => {
    const input = {
      items: [
        {_key: 'a', value: 1},
        {_key: 'b', value: 2},
      ],
    }
    const output = set(input, {'items[_key=="b"].value': 42})
    expect(output).toEqual({
      items: [
        {_key: 'a', value: 1},
        {_key: 'b', value: 42},
      ],
    })
  })

  it('leaves input unchanged if the path expression matches nothing', () => {
    const input = {a: 1}
    const output = set(input, {'nonexistent.path': 999})
    expect(output).toEqual({a: 1})
  })
})

describe('setIfMissing', () => {
  it('only sets missing (null or undefined) values', () => {
    const input = {a: {b: undefined, c: 3}}
    const output = setIfMissing(input, {'a.b': 99, 'a.c': 100})
    expect(output).toEqual({a: {b: 99, c: 3}})
  })

  it('updates missing values in arrays for a range match', () => {
    const input = {items: [undefined, 2, null]}
    const output = setIfMissing(input, {'items[:]': 0})
    expect(output).toEqual({items: [0, 2, 0]})
  })

  it('leaves input unchanged if no matched value is missing', () => {
    const input = {a: {b: 1}}
    const output = setIfMissing(input, {'a.b': 42})
    expect(output).toEqual({a: {b: 1}})
  })
})

describe('unset', () => {
  it('unsets a property from an object', () => {
    const input = {a: {b: 1, c: 2}}
    const output = unset(input, ['a.b'])
    expect(output).toEqual({a: {c: 2}})
  })

  it('unsets an element from an array', () => {
    const input = {items: [1, 2, 3]}
    const output = unset(input, ['items[1]'])
    expect(output).toEqual({items: [1, 3]})
  })

  it('unsets multiple properties using multiple path expressions', () => {
    const input = {a: {b: 1, c: 2}, d: 4}
    const output = unset(input, ['a.b', 'd'])
    expect(output).toEqual({a: {c: 2}})
  })

  it('unsets an element using a keyed segment', () => {
    const input = {
      items: [
        {_key: 'a', value: 1},
        {_key: 'b', value: 2},
      ],
    }
    const output = unset(input, ['items[_key=="b"]'])
    expect(output).toEqual({items: [{_key: 'a', value: 1}]})
  })

  it('unsets multiple array elements when using a range', () => {
    const input = {items: [1, 2, 3, 4, 5]}
    const output = unset(input, ['items[1:3]'])
    expect(output).toEqual({items: [1, 3, 5]})
  })

  it('leaves input unchanged if no path expression matches', () => {
    const input = {a: 1}
    const output = unset(input, ['nonexistent'])
    expect(output).toEqual({a: 1})
  })
})

describe('inc', () => {
  it('increments simple numeric properties', () => {
    const input = {foo: {first: 3, second: 4.5}}
    const output = inc(input, {'foo.first': 3, 'foo.second': 4})
    expect(output).toEqual({foo: {first: 6, second: 8.5}})
  })

  it('ignores non-numeric values', () => {
    const input = {foo: {a: 'hello', b: 10}}
    const output = inc(input, {'foo.a': 5, 'foo.b': 2})
    expect(output).toEqual({foo: {a: 'hello', b: 12}})
  })

  it('increments array elements using a range match (only numbers)', () => {
    const input = {items: [1, 2, 'x', 4]}
    const output = inc(input, {'items[:]': 10})
    expect(output).toEqual({items: [11, 12, 'x', 14]})
  })

  it('leaves input unchanged if no match is found', () => {
    const input = {a: 1}
    const output = inc(input, {nonexistent: 5})
    expect(output).toEqual(input)
  })

  it('supports negative increments (adding a negative value)', () => {
    const input = {foo: 5}
    const output = inc(input, {foo: -2})
    expect(output).toEqual({foo: 3})
  })
})

describe('dec', () => {
  it('decrements simple numeric properties', () => {
    const input = {foo: {first: 3, second: 4.5}}
    const output = dec(input, {'foo.first': 3, 'foo.second': 4})
    expect(output).toEqual({foo: {first: 0, second: 0.5}})
  })

  it('ignores non-numeric values', () => {
    const input = {foo: {a: 'hello', b: 10}}
    const output = dec(input, {'foo.a': 5, 'foo.b': 2})
    expect(output).toEqual({foo: {a: 'hello', b: 8}})
  })

  it('decrements array elements using a range match (only numbers)', () => {
    const input = {items: [20, 15, 'x', 10]}
    const output = dec(input, {'items[:]': 5})
    expect(output).toEqual({items: [15, 10, 'x', 5]})
  })

  it('leaves input unchanged if no match is found', () => {
    const input = {a: 1}
    const output = dec(input, {nonexistent: 5})
    expect(output).toEqual(input)
  })

  it('supports negative decrements (subtracting a negative value results in addition)', () => {
    const input = {foo: 5}
    const output = dec(input, {foo: -3})
    expect(output).toEqual({foo: 8})
  })
})

describe('insert', () => {
  it('returns the input unchanged if no operation property is provided', () => {
    const input = {some: {array: ['a', 'b', 'c']}}
    // Calling insert with an object that does not contain any of "before", "after", or "replace"
    // should return the input unchanged.
    // @ts-expect-error testing invalid input
    const output = insert(input, {items: ['!']})
    expect(output).toEqual(input)
  })

  it('inserts items before a given positive index ("before" operation)', () => {
    const input = {some: {array: ['a', 'b', 'c']}}
    const output = insert(input, {before: 'some.array[1]', items: ['!']})
    expect(output).toEqual({some: {array: ['a', '!', 'b', 'c']}})
  })

  it('interprets a negative index for "before" as append', () => {
    const input = {some: {array: ['a', 'b', 'c']}}
    const output = insert(input, {before: 'some.array[-1]', items: ['!']})
    expect(output).toEqual({some: {array: ['a', 'b', 'c', '!']}})
  })

  it('inserts items after a given positive index ("after" operation)', () => {
    const input = {some: {array: ['a', 'b', 'c']}}
    const output = insert(input, {after: 'some.array[1]', items: ['!']})
    expect(output).toEqual({some: {array: ['a', 'b', '!', 'c']}})
  })

  it('inserts items with keyed segments', () => {
    const input = {
      some: {
        array: [
          {_key: 'a', value: 'a'},
          {_key: 'b', value: 'b'},
          {_key: 'c', value: 'c'},
        ],
      },
    }
    const output = insert(input, {after: 'some.array[_key=="b"]', items: [{_key: '!', value: '!'}]})
    expect(output).toEqual({
      some: {
        array: [
          {_key: 'a', value: 'a'},
          {_key: 'b', value: 'b'},
          {_key: '!', value: '!'},
          {_key: 'c', value: 'c'},
        ],
      },
    })
  })

  it('inserts items after a negative index ("after" operation with negative index interpreted as prepend)', () => {
    const input = {some: {array: ['a', 'b', 'c']}}
    const output = insert(input, {after: 'some.array[-1]', items: ['!']})
    expect(output).toEqual({some: {array: ['!', 'a', 'b', 'c']}})
  })

  it('replaces a single matched element ("replace" operation, single match)', () => {
    const input = {some: {array: ['a', 'b', 'c']}}
    const output = insert(input, {replace: 'some.array[1]', items: ['!']})
    expect(output).toEqual({some: {array: ['a', '!', 'c']}})
  })

  it('replaces a single matched element ("replace" operation, single match) with a negative index', () => {
    const input = {some: {array: ['a', 'b', 'c']}}
    const output = insert(input, {replace: 'some.array[-1]', items: ['!']})
    expect(output).toEqual({some: {array: ['a', 'b', '!']}})
  })

  it('replaces multiple matched elements ("replace" operation, multiple matches)', () => {
    const input = {some: {array: ['a', 'b', 'c', 'd']}}
    const output = insert(input, {replace: 'some.array[1:3]', items: ['!']})
    expect(output).toEqual({some: {array: ['a', '!', 'd']}})
  })

  it('returns input unchanged if the matched parent is not an array', () => {
    const input = {some: {notArray: 'hello'}}
    const output = insert(input, {before: 'some.notArray', items: ['!']})
    expect(output).toEqual(input)
  })
})

describe('diffMatchPatch', () => {
  it('applies a diff-match-patch to a string property', () => {
    const input = {foo: 'the quick brown fox'}
    const patch = '@@ -13,7 +13,7 @@\n own \n-fox\n+cat\n'
    const output = diffMatchPatch(input, {foo: patch})
    expect(output).toEqual({foo: 'the quick brown cat'})
  })

  it('throws an error when the matched value is not a string', () => {
    const input = {foo: 123}
    const patch = '@@ -1,3 +1,3 @@\n-123\n+456\n'
    expect(() => diffMatchPatch(input, {foo: patch})).toThrowError(/Can't diff-match-patch/)
  })

  it('applies a diff-match-patch to multiple array elements', () => {
    const input = {foo: ['cat', 'cat']}
    const patch = '@@ -1,3 +1,3 @@\n-cat\n+dog\n'
    const output = diffMatchPatch(input, {'foo[:]': patch})
    expect(output).toEqual({foo: ['dog', 'dog']})
  })

  it('returns the input unchanged if no match is found', () => {
    const input = {foo: 'hello'}
    const patch = '@@ -1,5 +1,5 @@\n hello\n'
    const output = diffMatchPatch(input, {bar: patch})
    expect(output).toEqual(input)
  })

  it('applies a diff-match-patch that makes no changes', () => {
    const input = {foo: 'unchanged'}
    const patch = '@@ -1,9 +1,9 @@\n unchanged\n'
    const output = diffMatchPatch(input, {foo: patch})
    expect(output).toEqual({foo: 'unchanged'})
  })
})

describe('ifRevisionID', () => {
  it('returns the input if the revision ID matches', () => {
    const input = {_rev: 'abc123', data: 'test'}
    expect(ifRevisionID(input, 'abc123')).toEqual(input)
  })

  it('throws an error if the document does not have a revision ID', () => {
    const input = {data: 'test'}
    expect(() => ifRevisionID(input, 'abc123')).toThrowError(
      /Patch specified `ifRevisionID` but could not find document's revision ID/,
    )
  })

  it('throws an error if the revision ID does not match', () => {
    const input = {_rev: 'abc123', data: 'test'}
    expect(() => ifRevisionID(input, 'xyz789')).toThrowError(
      /Patch's `ifRevisionID` `xyz789` does not match document's revision ID `abc123`/,
    )
  })
})

describe('ensureArrayKeysDeep', () => {
  it('ensures all object within arrays have a `_key` property.', () => {
    const input = {
      _id: '123',
      _type: 'book',
      items: [
        {name: 'no key yet'},
        {name: 'has nested array', nestedArray: [{name: 'also no key yet'}]},
      ],
    }

    expect(ensureArrayKeysDeep(input)).toMatchObject({
      _id: '123',
      _type: 'book',
      items: [
        {_key: expect.stringMatching(/\w{12}/), name: 'no key yet'},
        {
          _key: expect.stringMatching(/\w{12}/),
          name: 'has nested array',
          nestedArray: [{_key: expect.stringMatching(/\w{12}/), name: 'also no key yet'}],
        },
      ],
    })
  })

  it('returns the original object if no keys were changed', () => {
    const input = {
      _id: '123',
      _type: 'book',
      items: [{_key: 'already has key'}],
    }

    expect(ensureArrayKeysDeep(input)).toBe(input)
  })

  it('returns the original array if the array is empty', () => {
    const input: never[] = []
    expect(ensureArrayKeysDeep(input)).toBe(input)
  })

  it('returns the original array if the array is a primitive array', () => {
    const input = ['a', 'b', 'c']
    expect(ensureArrayKeysDeep(input)).toBe(input)
  })

  it('returns the same item if not an object', () => {
    // this is mostly invalid input but we can test the branch
    const input = [{_key: 'has key'}, function notAnObject() {}]
    const result = ensureArrayKeysDeep(input)
    expect(result[1]).toBe(input[1])
  })

  it('memoizes over previous values', () => {
    const input = {
      allItemsAlreadyHaveKeys: [
        {_key: 'a', name: 'a'},
        {_key: 'b', name: 'b'},
      ],
      noKeysYet: [{name: 'c'}, {name: 'd'}],
      nestedObject: {
        allItemsAlreadyHaveKeys: [
          {_key: 'a', name: 'a'},
          {_key: 'b', name: 'b'},
        ],
        noKeysYet: [{name: 'c'}, {name: 'd'}],
      },
    }

    const result1 = ensureArrayKeysDeep(input)
    const result2 = ensureArrayKeysDeep(input)

    expect(result1).toBe(result2)
    expect(input.allItemsAlreadyHaveKeys).toBe(result1.allItemsAlreadyHaveKeys)

    expect(input.noKeysYet).not.toBe(result1.noKeysYet)
    expect(result1.noKeysYet).toMatchObject([
      {name: 'c', _key: expect.stringMatching(/\w{12}/)},
      {name: 'd', _key: expect.stringMatching(/\w{12}/)},
    ])

    expect(input.nestedObject.allItemsAlreadyHaveKeys).toBe(
      result2.nestedObject.allItemsAlreadyHaveKeys,
    )
    expect(input.nestedObject.noKeysYet).not.toBe(result2.nestedObject.noKeysYet)
  })
})
