import {
  type IndexTuple,
  isKeySegment,
  type KeyedSegment,
  type Path,
  type PathSegment,
} from '@sanity/types'

export type SingleValuePath = Exclude<PathSegment, IndexTuple>[]

export interface MatchOptions {
  input: unknown
  pathExpression: string
}

export interface MatchEntry {
  value: unknown
  path: SingleValuePath
}

function parseBracketContent(content: string): PathSegment {
  // 1) Range match:  ^(\d*):(\d*)$
  //    - start or end can be empty (meaning "start" or "end" of array)
  const rangeMatch = content.match(/^(\d*):(\d*)$/)
  if (rangeMatch) {
    const startStr = rangeMatch[1]
    const endStr = rangeMatch[2]
    const start: number | '' = startStr === '' ? '' : parseInt(startStr, 10)
    const end: number | '' = endStr === '' ? '' : parseInt(endStr, 10)
    return [start, end]
  }

  // 2) Keyed segment match:  ^_key==["'](.*)["']$
  //    (We allow either double or single quotes for the value)
  const keyedMatch = content.match(/^_key==["'](.+)["']$/)
  if (keyedMatch) {
    return {_key: keyedMatch[1]}
  }

  // 3) Single index (positive or negative)
  const index = parseInt(content, 10)
  if (!isNaN(index)) {
    return index
  }

  throw new Error(`Invalid bracket content: “[${content}]”`)
}

function parseSegment(segment: string): PathSegment[] {
  // Each "segment" can contain:
  // - A leading property name (optional).
  // - Followed by zero or more bracket expressions, e.g. foo[1][_key=="bar"][2:9].
  //
  // We'll collect these into an array of path segments.

  const segments: PathSegment[] = []
  let idx = 0

  // Helper to push a string if it's not empty
  function pushIfNotEmpty(text: string) {
    if (text) {
      segments.push(text)
    }
  }

  while (idx < segment.length) {
    // Look for the next '['
    const openIndex = segment.indexOf('[', idx)
    if (openIndex === -1) {
      // No more brackets – whatever remains is a plain string key
      const remaining = segment.slice(idx)
      pushIfNotEmpty(remaining)
      break
    }

    // Push text before this bracket (as a string key) if not empty
    const before = segment.slice(idx, openIndex)
    pushIfNotEmpty(before)

    // Find the closing bracket
    const closeIndex = segment.indexOf(']', openIndex)
    if (closeIndex === -1) {
      throw new Error(`Unmatched "[" in segment: "${segment}"`)
    }

    // Extract the bracket content
    const bracketContent = segment.slice(openIndex + 1, closeIndex)
    segments.push(parseBracketContent(bracketContent))

    // Move past the bracket
    idx = closeIndex + 1
  }

  return segments
}

export function parsePath(path: string): Path {
  // We want to split on '.' outside of brackets. A simple approach is
  // to track "are we in bracket or not?" while scanning.
  const result: Path = []
  let buffer = ''
  let bracketDepth = 0

  for (let i = 0; i < path.length; i++) {
    const ch = path[i]
    if (ch === '[') {
      bracketDepth++
      buffer += ch
    } else if (ch === ']') {
      bracketDepth--
      buffer += ch
    } else if (ch === '.' && bracketDepth === 0) {
      // We hit a dot at the top level → this ends one segment
      if (buffer) {
        result.push(...parseSegment(buffer))
        buffer = ''
      }
    } else {
      buffer += ch
    }
  }

  // If there's anything left in the buffer, parse it
  if (buffer) {
    result.push(...parseSegment(buffer))
  }

  return result
}

export function stringifyPath(path: Path): string {
  let result = ''
  for (let i = 0; i < path.length; i++) {
    const segment = path[i]

    if (typeof segment === 'string') {
      // If not the first segment and the previous segment was
      // not a bracket form, we add a dot
      if (result) {
        result += '.'
      }
      result += segment
    } else if (typeof segment === 'number') {
      // Single index
      result += `[${segment}]`
    } else if (Array.isArray(segment)) {
      // Index tuple
      const [start, end] = segment
      const startStr = start === '' ? '' : String(start)
      const endStr = end === '' ? '' : String(end)
      result += `[${startStr}:${endStr}]`
    } else {
      // Keyed segment
      // e.g. {_key: "someValue"} => [_key=="someValue"]
      result += `[_key=="${segment._key}"]`
    }
  }
  return result
}

/**
 * A very simplified implementation of [JSONMatch][0] that only supports:
 * - descent e.g. `friend.name`
 * - array index e.g. `items[-1]`
 * - array matching with `_key` e.g. `items[_key=="dd9efe09"]`
 * - array matching with a range e.g. `items[4:]`
 *
 * E.g. `friends[_key=="dd9efe09"].address.zip`
 *
 * [0]: https://www.sanity.io/docs/json-match
 */

export function jsonMatch({input, pathExpression}: MatchOptions): MatchEntry[] {
  return matchRecursive(input, parsePath(pathExpression), [])
}

function matchRecursive(value: unknown, path: Path, currentPath: SingleValuePath): MatchEntry[] {
  // If we've consumed the entire path, return the final match
  if (path.length === 0) {
    return [{value, path: currentPath}]
  }

  const [head, ...rest] = path

  // 1) String segment => object property
  if (typeof head === 'string') {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const obj = value as Record<string, unknown>
      const nextValue = obj[head]
      return matchRecursive(nextValue, rest, [...currentPath, head])
    }
    // If not an object with that property, no match
    return []
  }

  // 2) Numeric segment => array index
  if (typeof head === 'number') {
    if (Array.isArray(value)) {
      const nextValue = value.at(head)
      return matchRecursive(nextValue, rest, [...currentPath, head])
    }
    // If not an array, no match
    return []
  }

  // 3) Index tuple => multiple indices
  if (Array.isArray(head)) {
    // This is a range: [start, end]
    if (!Array.isArray(value)) {
      // If not an array, no match
      return []
    }

    const [start, end] = head
    // Convert empty strings '' to the start/end of the array
    const startIndex = start === '' ? 0 : start
    const endIndex = end === '' ? value.length : end

    // We’ll accumulate all matches from each index in the range
    let results: MatchEntry[] = []

    // Decide whether the range is exclusive or inclusive. The example in
    // the doc says "array[1:9]" => element 1 through 9 (non-inclusive?).
    // Typically, in slice terms, that is `array.slice(1, 9)` → includes
    // indices 1..8. If that's your intention, do i < endIndex.
    for (let i = startIndex; i < endIndex; i++) {
      results = results.concat(matchRecursive(value[i], rest, [...currentPath, i]))
    }

    return results
  }

  // 4) Keyed segment => find index in array
  //    e.g. {_key: 'foo'}
  const keyed = head as KeyedSegment
  const arrIndex = getIndexForKey(value, keyed._key)
  if (arrIndex === undefined || !Array.isArray(value)) {
    return []
  }

  const nextVal = value[arrIndex]
  return matchRecursive(nextVal, rest, [...currentPath, arrIndex])
}

export interface SetOptions {
  input: unknown
  pathExpressionValues: Record<string, unknown>
}

/**
 * Given an input object and a record of path expressions to values, this
 * function will set each match with the given value.
 *
 * ```js
 * const output = set({
 *   input: { name: { first: '', last: '' } },
 *   pathExpressionValues: {
 *     'name.*': 'changed',
 *   },
 * });
 *
 * // { name: { first: 'changed', second: 'changed' } }
 * console.log(output);
 * ```
 */
export function set<R>(options: SetOptions): R
export function set({input, pathExpressionValues}: SetOptions): unknown {
  return Object.entries(pathExpressionValues)
    .flatMap(([pathExpression, replacementValue]) =>
      jsonMatch({
        input: input,
        pathExpression,
      }).map((matchEntry) => ({
        ...matchEntry,
        replacementValue,
      })),
    )
    .reduce(
      (acc, {path, replacementValue}) =>
        setDeep({
          input: acc,
          path,
          value: replacementValue,
        }),
      input,
    )
}

export interface SetIfMissingOptions {
  input: unknown
  pathExpressionValues: Record<string, unknown>
}

/**
 * Given an input object and a record of path expressions to values, this
 * function will set each match with the given value if the value at the current
 * path is missing. A missing value is either `null` or `undefined`.
 *
 * ```js
 * const output = setIfMissing({
 *   input: { name: { first: 'same', last: null } },
 *   pathExpressionValues: {
 *     'name.*': 'changed',
 *   },
 * });
 *
 * // { name: { first: 'same', second: 'changed' } }
 * console.log(output);
 * ```
 */
export function setIfMissing<R>(options: SetIfMissingOptions): R
export function setIfMissing({input, pathExpressionValues}: SetIfMissingOptions): unknown {
  return Object.entries(pathExpressionValues)
    .flatMap(([pathExpression, replacementValue]) => {
      return jsonMatch({input, pathExpression}).map((matchEntry) => ({
        ...matchEntry,
        replacementValue,
      }))
    })
    .filter((matchEntry) => matchEntry.value === null || matchEntry.value === undefined)
    .reduce(
      (acc, {path, replacementValue}) =>
        setDeep({
          input: acc,
          path,
          value: replacementValue,
        }),
      input,
    )
}

export interface UnsetOptions {
  input: unknown
  pathExpressions: string[]
}

/**
 * Given an input object and an array of path expressions, this function will
 * remove each match from the input object.
 *
 * ```js
 * const output = unset({
 *   input: { name: { first: 'one', last: 'two' } },
 *   pathExpressions: ['name.*'],
 * });
 *
 * // { name: { } }
 * console.log(output);
 * ```
 */
export function unset<R>(options: UnsetOptions): R
export function unset({input, pathExpressions}: UnsetOptions): unknown {
  return pathExpressions
    .flatMap((pathExpression) => jsonMatch({input, pathExpression}))
    .reduce((acc, {path}) => unsetDeep({input: acc, path}), input)
}

const operations = ['before', 'after', 'replace'] as const
type Operation = (typeof operations)[number]
type OperationEntryObject = {
  [P in Operation]: {[K in P]: string}
}[Operation]

export type InsertOptions = {
  input: unknown
  items: unknown[]
} & OperationEntryObject

/**
 * Given an input object, a path expression, and an array of items, this
 * function will either insert or replace the matched items.
 *
 * ```js
 * // insert before
 * const output = insert({
 *   input: { some: { array: ['a', 'b', 'c'] } },
 *   before: 'some.array[2]',
 *   items: ['!'],
 * });
 *
 * // { some: { array: ['a', 'b', 'c', '!'] } }
 * console.log(output);
 * ```
 *
 * ```js
 * // append
 * const output = insert({
 *   input: { some: { array: ['a', 'b', 'c'] } },
 *   before: 'some.array[-1]', // negative index for add to the end
 *   items: ['!'],
 * });
 *
 * // { some: { array: ['a', 'b', 'c', '!'] } }
 * console.log(output);
 * ```
 *
 * ```js
 * // prepend
 * const output = insert({
 *   input: { some: { array: ['a', 'b', 'c'] } },
 *   before: 'some.array[0]',
 *   items: ['!'],
 * });
 *
 * // { some: { array: ['!', 'a', 'b', 'c'] } }
 * console.log(output);
 * ```
 *
 * ```js
 * // replace
 * const output = insert({
 *   input: { some: { array: ['a', 'b', 'c'] } },
 *   replace: 'some.array[1]',
 *   items: ['!'],
 * });
 *
 * // { some: { array: ['a', '!', 'c'] } }
 * console.log(output);
 * ```
 */
export function insert<R>(options: InsertOptions): R
export function insert({input, items, ...restOfInsertOptions}: InsertOptions): unknown {
  const operation = operations.find((op) => op in restOfInsertOptions)
  if (!operation) return input

  const pathExpression = (restOfInsertOptions as {[P in Operation]: string})[operation]

  interface ArrayMatchEntry {
    array: unknown[]
    pathToArray: SingleValuePath
    indexes: number[]
  }

  const arrayMatchEntries = Array.from(
    jsonMatch({input, pathExpression})
      .map(({path}) => {
        const segment = path[path.length - 1]
        let index
        if (isKeySegment(segment)) {
          index = getIndexForKey(input, segment._key)
        } else if (typeof segment === 'number') {
          index = segment
        }
        if (typeof index !== 'number') return null

        const parentPath = path.slice(0, path.length - 1)
        const parent = getDeep({input, path: parentPath})
        if (!Array.isArray(parent)) return null

        return {
          array: parent,
          pathToArray: parentPath,
          index,
        }
      })
      .filter(isNonNullable)
      // group all matches by their parent array, aggregating indexes
      .reduce<Map<unknown, ArrayMatchEntry>>((acc, next) => {
        const key = next.array
        const prev = acc.get(key)

        acc.set(key, {
          array: next.array,
          indexes: [...(prev?.indexes || []), next.index],
          pathToArray: next.pathToArray,
        })

        return acc
      }, new Map())
      .values(),
  ).map((entry) => ({
    ...entry,
    // ensure sorted
    indexes: entry.indexes.sort(),
  }))

  return arrayMatchEntries.reduce<unknown>((acc, {array, indexes, pathToArray}) => {
    switch (operation) {
      case 'before': {
        const firstIndex = indexes[0]
        const indexBeforeFirstIndex = firstIndex

        return setDeep({
          input: acc,
          path: pathToArray,
          value: [
            ...array.slice(0, indexBeforeFirstIndex),
            ...items,
            ...array.slice(indexBeforeFirstIndex),
          ],
        })
      }
      case 'after': {
        const lastIndex = indexes[indexes.length - 1] + 1

        return setDeep({
          input: acc,
          path: pathToArray,
          value: [...array.slice(0, lastIndex), ...items, ...array.slice(lastIndex)],
        })
      }
      case 'replace': {
        // replace is interesting because the indexes don't have to be
        // consecutive. the behavior is then defined as:
        // 1. delete all matching items in the array
        // 2. insert the rest of the items at the first matching index
        const firstIndex = indexes[0]
        const indexSet = new Set(indexes)

        return setDeep({
          input: acc,
          path: pathToArray,
          value: [
            ...array.slice(0, firstIndex),
            ...items,
            ...array.slice(firstIndex).filter((_, index) => !indexSet.has(index + firstIndex)),
          ],
        })
      }
      default: {
        return acc
      }
    }
  }, input)
}

export interface IncDecOptions {
  input: unknown
  pathExpressionValues: Record<string, number>
}

/**
 * Given an input object and a record of path expressions to numeric values,
 * this function will increment each match with the given value.
 *
 * ```js
 * const output = inc({
 *   input: { foo: { first: 3, second: 4.5 } },
 *   pathExpressionValues: {
 *     'foo.*': 3,
 *   },
 * });
 *
 * // { foo: { first: 6, second: 7.5 } }
 * console.log(output);
 * ```
 */
export function inc<R>(options: IncDecOptions): R
export function inc({input, pathExpressionValues}: IncDecOptions): unknown {
  return Object.entries(pathExpressionValues)
    .flatMap(([pathExpression, valueToAdd]) =>
      jsonMatch({
        input: input,
        pathExpression,
      }).map((matchEntry) => ({
        ...matchEntry,
        valueToAdd,
      })),
    )
    .filter(
      <T extends {value: unknown}>(matchEntry: T): matchEntry is T & {value: number} =>
        typeof matchEntry.value === 'number',
    )
    .reduce(
      (acc, {path, value, valueToAdd}) =>
        setDeep({
          input: acc,
          path,
          value: value + valueToAdd,
        }),
      input,
    )
}

/**
 * Given an input object and a record of path expressions to numeric values,
 * this function will decrement each match with the given value.
 *
 * ```js
 * const output = dec({
 *   input: { foo: { first: 3, second: 4.5 } },
 *   pathExpressionValues: {
 *     'foo.*': 3,
 *   },
 * });
 *
 * // { foo: { first: 0, second: 1.5 } }
 * console.log(output);
 * ```
 */
export function dec<R>(options: IncDecOptions): R
export function dec({pathExpressionValues, ...restOfOptions}: IncDecOptions): unknown {
  return inc({
    ...restOfOptions,
    pathExpressionValues: Object.fromEntries(
      Object.entries(pathExpressionValues)
        .filter(([, value]) => typeof value === 'number')
        .map(([key, value]) => [key, -value]),
    ),
  })
}

export interface GetDeepOptions {
  input: unknown
  path: SingleValuePath
}

function isNonNullable<T>(t: T): t is NonNullable<T> {
  return t !== null && t !== undefined
}

const indexCache = new WeakMap<KeyedSegment[], Record<string, number | undefined>>()
export function getIndexForKey(input: unknown, key: string): number | undefined {
  if (!Array.isArray(input)) return undefined
  const cached = indexCache.get(input)
  if (cached) return cached[key]

  const lookup = input.reduce<Record<string, number | undefined>>((acc, next, index) => {
    if (typeof next?._key === 'string') acc[next._key] = index
    return acc
  }, {})

  indexCache.set(input, lookup)
  return lookup[key]
}

/**
 * Gets a value deep inside of an object given a path. If the path does not
 * exist in the object, `undefined` will be returned
 */
export function getDeep<R>(options: GetDeepOptions): R
export function getDeep({input, path}: GetDeepOptions): unknown {
  const [currentSegment, ...restOfPath] = path
  if (currentSegment === undefined) return input
  if (typeof input !== 'object') return undefined
  if (input === null) return undefined

  let key
  if (isKeySegment(currentSegment)) {
    key = getIndexForKey(input, currentSegment._key)
  } else if (typeof currentSegment === 'string') {
    key = currentSegment
  } else if (typeof currentSegment === 'number') {
    key = currentSegment
  }

  if (key === undefined) return undefined
  const nestedInput = (input as Record<string, unknown>)[key]
  return getDeep({input: nestedInput, path: restOfPath})
}

export interface SetDeepOptions {
  input: unknown
  path: SingleValuePath
  value: unknown
}

/**
 * Sets a value deep inside of an object given a path. If the path does not
 * exist in the object, it will be created.
 */
export function setDeep<R>(options: SetDeepOptions): R
export function setDeep({input, path, value}: SetDeepOptions): unknown {
  const [currentSegment, ...restOfPath] = path
  if (currentSegment === undefined) return value

  if (typeof input !== 'object' || input === null) {
    if (typeof currentSegment === 'string') {
      return {
        [currentSegment]: setDeep({
          input: null,
          path: restOfPath,
          value,
        }),
      }
    }

    let index
    if (isKeySegment(currentSegment)) {
      // if our input is not an array and our path segment is a keyed segment
      // set the index to 0
      index = 0
    } else if (typeof currentSegment === 'number' && currentSegment >= 0) {
      index = currentSegment
    } else {
      return input
    }

    return [
      // fill the start of this array with null values
      ...Array.from({
        length: index,
      }).fill(null),
      // then set the index of the currentSegment with the new value
      setDeep({
        input: null,
        path: restOfPath,
        value,
      }),
    ]
  }

  if (Array.isArray(input)) {
    let index
    if (isKeySegment(currentSegment)) {
      index = getIndexForKey(input, currentSegment._key)
    } else if (typeof currentSegment === 'number') {
      index = currentSegment
    }
    if (index === undefined) return input

    // TODO: support negative indexes
    // e.g. to get the last value
    if (index < 0) return input

    if (index in input) {
      return input.map((nestedInput, i) =>
        currentSegment === i
          ? setDeep({
              input: nestedInput,
              path: restOfPath,
              value,
            })
          : nestedInput,
      )
    }

    return [
      // copy the values from the current array
      ...input,
      // then fill with null values up until the index
      ...Array.from({
        length: index - input.length,
      }).fill(null),
      // then set the index with the new value
      setDeep({
        input: null,
        path: restOfPath,
        value,
      }),
    ]
  }

  // at this point, it's not valid input if the segment is a keyed segment
  if (typeof currentSegment === 'object') return input

  // the current segment exists in the object so reuse it
  if (currentSegment in input) {
    return Object.fromEntries(
      Object.entries(input).map(([key, nestedInput]) =>
        key === currentSegment
          ? [key, setDeep({input: nestedInput, path: restOfPath, value})]
          : [key, nestedInput],
      ),
    )
  }

  // the current segment doesn't exist in the object so create the path
  return {
    ...input,
    [currentSegment]: setDeep({
      input: null,
      path: restOfPath,
      value,
    }),
  }
}

export interface UnsetDeepOptions {
  input: unknown
  path: SingleValuePath
}

/**
 * Given an object and an exact path as an array, this unsets the value at the
 * given path.
 */
export function unsetDeep<R>(options: UnsetDeepOptions): R
export function unsetDeep({input, path}: UnsetDeepOptions): unknown {
  const [currentSegment, ...restOfPath] = path

  if (currentSegment === undefined) return input
  if (typeof input !== 'object') return input
  if (input === null) return input

  let _segment
  if (isKeySegment(currentSegment)) {
    _segment = getIndexForKey(input, currentSegment._key)
  } else if (typeof currentSegment === 'string' || typeof currentSegment === 'number') {
    _segment = currentSegment
  }
  if (_segment === undefined) return input
  // TODO: support negative indexes
  if (!(_segment in input)) return input
  const segment = _segment

  if (!restOfPath.length) {
    if (Array.isArray(input)) {
      return input.filter((_nestedInput, index) => index !== segment)
    }
    return Object.fromEntries(Object.entries(input).filter(([key]) => key !== segment.toString()))
  }

  if (Array.isArray(input)) {
    return input.map((nestedInput, index) =>
      index === segment ? unsetDeep({input: nestedInput, path: restOfPath}) : nestedInput,
    )
  }

  return Object.fromEntries(
    Object.entries(input).map(([key, value]) =>
      key === segment ? [key, unsetDeep({input: value, path: restOfPath})] : [key, value],
    ),
  )
}
