import {applyPatches, parsePatch} from '@sanity/diff-match-patch'
import {
  type IndexTuple,
  type InsertPatch,
  isKeyedObject,
  isKeySegment,
  type KeyedSegment,
  type Path,
  type PathSegment,
  type SanityDocumentLike,
} from '@sanity/types'

type SingleValuePath = Exclude<PathSegment, IndexTuple>[]

type ToNumber<TInput extends string> = TInput extends `${infer TNumber extends number}`
  ? TNumber
  : TInput

/**
 * Parse a single “segment” that may include bracket parts.
 *
 * For example, the literal
 *
 * ```
 * "friends[0][1]"
 * ```
 *
 * is parsed as:
 *
 * ```
 * ["friends", 0, 1]
 * ```
 */
type ParseSegment<TInput extends string> = TInput extends `${infer TProp}[${infer TRest}`
  ? TProp extends ''
    ? [...ParseBracket<`[${TRest}`>] // no property name before '['
    : [TProp, ...ParseBracket<`[${TRest}`>]
  : TInput extends ''
    ? []
    : [TInput]

/**
 * Parse one or more bracketed parts from a segment.
 *
 * It recursively “peels off” a bracketed part and then continues.
 *
 * For example, given the string:
 *
 * ```
 * "[0][foo]"
 * ```
 *
 * it produces:
 *
 * ```
 * [ToNumber<"0">, "foo"]
 * ```
 */
type ParseBracket<TInput extends string> = TInput extends `[${infer TPart}]${infer TRest}`
  ? [ToNumber<TPart>, ...ParseSegment<TRest>]
  : [] // no leading bracket → end of this segment

/**
 * Split the entire path string on dots “outside” of any brackets.
 *
 * For example:
 * ```
 * "friends[0].name"
 * ```
 *
 * becomes:
 *
 * ```
 * [...ParseSegment<"friends[0]">, ...ParseSegment<"name">]
 * ```
 *
 * (We use a simple recursion that splits on the first dot.)
 */
type PathParts<TPath extends string> = TPath extends `${infer TLeft}.${infer TRight}`
  ? [...ParseSegment<TLeft>, ...PathParts<TRight>]
  : ParseSegment<TPath>

/**
 * Given a type T and an array of “access keys” Parts, recursively index into T.
 *
 * If a part is a key, it looks up that property.
 * If T is an array and the part is a number, it “indexes” into the element type.
 */
type DeepGet<T, TParts extends readonly unknown[]> = TParts extends [infer Head, ...infer Tail]
  ? Head extends keyof T
    ? DeepGet<T[Head], Tail>
    : T extends Array<infer U>
      ? Head extends number
        ? DeepGet<U, Tail>
        : never
      : never
  : T

/**
 * Given a document type TDocument and a JSON Match path string TPath,
 * compute the type found at that path.
 * @beta
 */
export type JsonMatch<TDocument extends SanityDocumentLike, TPath extends string> = DeepGet<
  TDocument,
  PathParts<TPath>
>

/**
 * Computing the full possible paths may be possible but is hard to compute
 * within the type system for complex document types so we use string.
 * @beta
 */
export type JsonMatchPath<_TDocument extends SanityDocumentLike> = string

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

type MatchEntry<T = unknown> = {
  value: T
  path: SingleValuePath
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
 *
 * @beta
 */
export function jsonMatch<
  TDocument extends SanityDocumentLike,
  TPath extends JsonMatchPath<TDocument>,
>(input: TDocument, path: TPath): MatchEntry<JsonMatch<TDocument, TPath>>[]
/** @beta */
export function jsonMatch<TValue>(input: unknown, path: string): MatchEntry<TValue>[]
/** @beta */
export function jsonMatch(input: unknown, pathExpression: string): MatchEntry[] {
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

// this is a similar array key to the studio:
// https://github.com/sanity-io/sanity/blob/v3.74.1/packages/sanity/src/core/form/inputs/arrays/ArrayOfObjectsInput/createProtoArrayValue.ts
function generateArrayKey(length: number = 12): string {
  // Each byte gives two hex characters, so generate enough bytes.
  const numBytes = Math.ceil(length / 2)
  const bytes = crypto.getRandomValues(new Uint8Array(numBytes))
  // Convert each byte to a 2-digit hex string and join them.
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, length)
}

function memoize<TFunction extends (input: unknown) => unknown>(fn: TFunction): TFunction {
  const cache = new WeakMap<object, unknown>()
  return ((input) => {
    if (!input || typeof input !== 'object') return fn(input)

    const cached = cache.get(input)
    if (cached) return cached

    const result = fn(input)
    cache.set(input, result)
    return result
  }) as TFunction
}

/**
 * Recursively traverse a value. When an array is encountered, ensure that
 * each object item has a _key property. Memoized such that sub-objects that
 * have not changed aren't re-computed.
 */
export const ensureArrayKeysDeep = memoize(<R>(input: R): R => {
  if (!input || typeof input !== 'object') return input

  if (Array.isArray(input)) {
    // if the array is empty then just return the input
    if (!input.length) return input
    const first = input[0]
    // if the first input in the array isn't an object (null is allowed) then
    // assume that this is an array of primitives, just return the input
    if (typeof first !== 'object') return input

    // if all the items already have a key, then return the input
    if (input.every(isKeyedObject)) return input

    // otherwise return a new object item with a new key
    return input.map((item: unknown) => {
      if (!item || typeof item !== 'object') return item
      if (isKeyedObject(item)) return ensureArrayKeysDeep(item)
      const next = ensureArrayKeysDeep(item)
      return {...next, _key: generateArrayKey()}
    }) as R
  }

  const entries = Object.entries(input).map(([key, value]) => [key, ensureArrayKeysDeep(value)])

  if (entries.every(([key, value]) => input[key as keyof typeof input] === value)) {
    return input
  }

  return Object.fromEntries(entries) as R
})

/**
 * Given an input object and a record of path expressions to values, this
 * function will set each match with the given value.
 *
 * ```js
 * const output = set(
 *   {name: {first: 'initial', last: 'initial'}},
 *   {'name.first': 'changed'}
 * );
 *
 * // { name: { first: 'changed', last: 'initial' } }
 * console.log(output);
 * ```
 */
export function set<R>(input: unknown, pathExpressionValues: Record<string, unknown>): R
export function set(input: unknown, pathExpressionValues: Record<string, unknown>): unknown {
  const result = Object.entries(pathExpressionValues)
    .flatMap(([pathExpression, replacementValue]) =>
      jsonMatch(input, pathExpression).map((matchEntry) => ({
        ...matchEntry,
        replacementValue,
      })),
    )
    .reduce((acc, {path, replacementValue}) => setDeep(acc, path, replacementValue), input)

  return ensureArrayKeysDeep(result)
}

/**
 * Given an input object and a record of path expressions to values, this
 * function will set each match with the given value **if the value at the current
 * path is missing** (i.e. `null` or `undefined`).
 *
 * ```js
 * const output = setIfMissing(
 *   {items: [null, 'initial']},
 *   {'items[:]': 'changed'}
 * );
 *
 * // { items: ['changed', 'initial'] }
 * console.log(output);
 * ```
 */
export function setIfMissing<R>(input: unknown, pathExpressionValues: Record<string, unknown>): R
export function setIfMissing(
  input: unknown,
  pathExpressionValues: Record<string, unknown>,
): unknown {
  const result = Object.entries(pathExpressionValues)
    .flatMap(([pathExpression, replacementValue]) => {
      return jsonMatch(input, pathExpression).map((matchEntry) => ({
        ...matchEntry,
        replacementValue,
      }))
    })
    .filter((matchEntry) => matchEntry.value === null || matchEntry.value === undefined)
    .reduce((acc, {path, replacementValue}) => setDeep(acc, path, replacementValue), input)

  return ensureArrayKeysDeep(result)
}

/**
 * Given an input object and an array of path expressions, this function will
 * remove each match from the input object.
 *
 * ```js
 * const output = unset(
 *   {name: {first: 'one', last: 'two'}},
 *   ['name.last']
 * );
 *
 * // { name: { first: 'one' } }
 * console.log(output);
 * ```
 */
export function unset<R>(input: unknown, pathExpressions: string[]): R
export function unset(input: unknown, pathExpressions: string[]): unknown {
  const result = pathExpressions
    .flatMap((pathExpression) => jsonMatch(input, pathExpression))
    .reduce((acc, {path}) => unsetDeep(acc, path), input)

  return ensureArrayKeysDeep(result)
}

const operations = ['before', 'after', 'replace'] as const
type Operation = (typeof operations)[number]

/**
 * Given an input object, a path expression (inside the insert patch object), and an array of items,
 * this function will insert or replace the matched items.
 *
 * **Insert before:**
 *
 * ```js
 * const input = {some: {array: ['a', 'b', 'c']}}
 * const output = insert(
 *   input,
 *   {
 *     before: 'some.array[1]',
 *     items: ['!']
 *   }
 * );
 * // { some: { array: ['a', '!', 'b', 'c'] } }
 * console.log(output);
 * ```
 *
 * **Insert before with negative index (append):**
 *
 * ```js
 * const input = {some: {array: ['a', 'b', 'c']}}
 * const output = insert(
 *   input,
 *   {
 *     before: 'some.array[-1]',
 *     items: ['!']
 *   }
 * );
 * // { some: { array: ['a', 'b', 'c', '!'] } }
 * console.log(output);
 * ```
 *
 * **Insert after:**
 *
 * ```js
 * const input = {some: {array: ['a', 'b', 'c']}}
 * const output = insert(
 *   input,
 *   {
 *     after: 'some.array[1]',
 *     items: ['!']
 *   }
 * );
 * // { some: { array: ['a', 'b', '!', 'c'] } }
 * console.log(output);
 * ```
 *
 * **Replace:**
 *
 * ```js
 * const output = insert(
 *   { some: { array: ['a', 'b', 'c'] } },
 *   {
 *     replace: 'some.array[1]',
 *     items: ['!']
 *   }
 * );
 * // { some: { array: ['a', '!', 'c'] } }
 * console.log(output);
 * ```
 *
 * **Replace many:**
 *
 * ```js
 * const input = {some: {array: ['a', 'b', 'c', 'd']}}
 * const output = insert(
 *   input,
 *   {
 *     replace: 'some.array[1:3]',
 *     items: ['!', '?']
 *   }
 * );
 * // { some: { array: ['a', '!', '?', 'd'] } }
 * console.log(output);
 * ```
 */
export function insert<R>(input: unknown, insertPatch: InsertPatch): R
export function insert(input: unknown, insertPatch: InsertPatch): unknown {
  const operation = operations.find((op) => op in insertPatch)
  if (!operation) return input

  const {items} = insertPatch
  const pathExpression = (insertPatch as {[K in Operation]?: string} & {items: unknown})[operation]
  if (typeof pathExpression !== 'string') return input

  // Helper to normalize a matched index given the parent array’s length.
  function normalizeIndex(index: number, parentLength: number): number {
    switch (operation) {
      case 'before':
        // A negative index means “append” (i.e. insert before a hypothetical element
        // beyond the end of the array).
        return index < 0 ? parentLength : index
      case 'after':
        // For "after", if the matched index is negative, we treat it as “prepend”:
        // by convention, we convert it to -1 so that later adding 1 produces 0.
        return index < 0 ? -1 : index
      default: // default to 'replace'
        // For replace, convert a negative index to the corresponding positive one.
        return index < 0 ? parentLength + index : index
    }
  }

  // Group the matched array entries by their parent array.
  interface GroupEntry {
    array: unknown[]
    pathToArray: SingleValuePath
    indexes: number[]
  }
  const grouped = new Map<unknown, GroupEntry>()
  jsonMatch(input, pathExpression)
    .map(({path}) => {
      const segment = path[path.length - 1]
      let index: number | undefined
      if (isKeySegment(segment)) {
        index = getIndexForKey(input, segment._key)
      } else if (typeof segment === 'number') {
        index = segment
      }
      if (typeof index !== 'number') return null

      const parentPath = path.slice(0, path.length - 1)
      const parent = getDeep(input, parentPath)
      if (!Array.isArray(parent)) return null

      const normalizedIndex = normalizeIndex(index, parent.length)
      return {parent, parentPath, normalizedIndex}
    })
    .filter(isNonNullable)
    .forEach(({parent, parentPath, normalizedIndex}) => {
      if (grouped.has(parent)) {
        grouped.get(parent)!.indexes.push(normalizedIndex)
      } else {
        grouped.set(parent, {array: parent, pathToArray: parentPath, indexes: [normalizedIndex]})
      }
    })

  // Sort the indexes for each grouped entry.
  const groupEntries = Array.from(grouped.values()).map((entry) => ({
    ...entry,
    indexes: entry.indexes.sort((a, b) => a - b),
  }))

  // For each group, update the parent array using setDeep.
  const result = groupEntries.reduce<unknown>((acc, {array, indexes, pathToArray}) => {
    switch (operation) {
      case 'before': {
        // Insert items before the first matched index.
        const firstIndex = indexes[0]
        return setDeep(acc, pathToArray, [
          ...array.slice(0, firstIndex),
          ...items,
          ...array.slice(firstIndex),
        ])
      }
      case 'after': {
        // Insert items after the last matched index.
        const lastIndex = indexes[indexes.length - 1] + 1
        return setDeep(acc, pathToArray, [
          ...array.slice(0, lastIndex),
          ...items,
          ...array.slice(lastIndex),
        ])
      }
      // default to 'replace' behavior
      default: {
        // Remove all matched items then insert the new items at the first match.
        const firstIndex = indexes[0]
        const indexSet = new Set(indexes)
        return setDeep(acc, pathToArray, [
          ...array.slice(0, firstIndex),
          ...items,
          ...array.slice(firstIndex).filter((_, idx) => !indexSet.has(idx + firstIndex)),
        ])
      }
    }
  }, input)

  return ensureArrayKeysDeep(result)
}

/**
 * Given an input object and a record of path expressions to numeric values,
 * this function will increment each match with the given value.
 *
 * ```js
 * const output = inc(
 *   {foo: {first: 3, second: 4.5}},
 *   {'foo.first': 3, 'foo.second': 4}
 * );
 *
 * // { foo: { first: 6, second: 8.5 } }
 * console.log(output);
 * ```
 */
export function inc<R>(input: unknown, pathExpressionValues: Record<string, number>): R
export function inc(input: unknown, pathExpressionValues: Record<string, number>): unknown {
  const result = Object.entries(pathExpressionValues)
    .flatMap(([pathExpression, valueToAdd]) =>
      jsonMatch(input, pathExpression).map((matchEntry) => ({
        ...matchEntry,
        valueToAdd,
      })),
    )
    .filter(
      <T extends {value: unknown}>(matchEntry: T): matchEntry is T & {value: number} =>
        typeof matchEntry.value === 'number',
    )
    .reduce((acc, {path, value, valueToAdd}) => setDeep(acc, path, value + valueToAdd), input)

  return ensureArrayKeysDeep(result)
}

/**
 * Given an input object and a record of path expressions to numeric values,
 * this function will decrement each match with the given value.
 *
 * ```js
 * const output = dec(
 *   {foo: {first: 3, second: 4.5}},
 *   {'foo.first': 3, 'foo.second': 4}
 * );
 *
 * // { foo: { first: 0, second: 0.5 } }
 * console.log(output);
 * ```
 */
export function dec<R>(input: unknown, pathExpressionValues: Record<string, number>): R
export function dec(input: unknown, pathExpressionValues: Record<string, number>): unknown {
  const result = inc(
    input,
    Object.fromEntries(
      Object.entries(pathExpressionValues)
        .filter(([, value]) => typeof value === 'number')
        .map(([key, value]) => [key, -value]),
    ),
  )

  return ensureArrayKeysDeep(result)
}

/**
 * Given an input object and a record of paths to [diff match patches][0], this
 * function will apply the diff match patch for the string at each match.
 *
 * [0]: https://www.sanity.io/docs/http-patches#aTbJhlAJ
 *
 * ```js
 * const output = diffMatchPatch(
 *   {foo: 'the quick brown fox'},
 *   {'foo': '@@ -13,7 +13,7 @@\n own \n-fox\n+cat\n'}
 * );
 *
 * // { foo: 'the quick brown cat' }
 * console.log(output);
 * ```
 */
export function diffMatchPatch<R>(input: unknown, pathExpressionValues: Record<string, string>): R
export function diffMatchPatch(
  input: unknown,
  pathExpressionValues: Record<string, string>,
): unknown {
  const result = Object.entries(pathExpressionValues)
    .flatMap(([pathExpression, dmp]) => jsonMatch(input, pathExpression).map((m) => ({...m, dmp})))
    .filter((i) => i.value !== undefined)
    .map(({path, value, dmp}) => {
      if (typeof value !== 'string') {
        throw new Error(
          `Can't diff-match-patch \`${JSON.stringify(value)}\` at path \`${stringifyPath(path)}\`, because it is not a string`,
        )
      }

      const [nextValue] = applyPatches(parsePatch(dmp), value)
      return {path, value: nextValue}
    })
    .reduce((acc, {path, value}) => setDeep(acc, path, value), input)

  return ensureArrayKeysDeep(result)
}

/**
 * Simply checks if the given document input has a `_rev` that matches the given
 * `revisionId` and throws otherwise.
 *
 * (No code example provided.)
 */
export function ifRevisionID<R>(input: unknown, revisionId: string): R
export function ifRevisionID(input: unknown, revisionId: string): unknown {
  const inputRev =
    typeof input === 'object' && !!input && '_rev' in input && typeof input._rev === 'string'
      ? input._rev
      : undefined

  if (typeof inputRev !== 'string') {
    throw new Error(`Patch specified \`ifRevisionID\` but could not find document's revision ID.`)
  }

  if (revisionId !== inputRev) {
    throw new Error(
      `Patch's \`ifRevisionID\` \`${revisionId}\` does not match document's revision ID \`${inputRev}\``,
    )
  }

  return input
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
 * exist in the object, `undefined` will be returned.
 */
export function getDeep<R>(input: unknown, path: SingleValuePath): R
export function getDeep(input: unknown, path: SingleValuePath): unknown {
  const [currentSegment, ...restOfPath] = path
  if (currentSegment === undefined) return input
  if (typeof input !== 'object' || input === null) return undefined

  let key
  if (isKeySegment(currentSegment)) {
    key = getIndexForKey(input, currentSegment._key)
  } else if (typeof currentSegment === 'string') {
    key = currentSegment
  } else if (typeof currentSegment === 'number') {
    key = currentSegment
  }

  if (key === undefined) return undefined

  // Use .at() to support negative indexes on arrays.
  const nestedInput =
    typeof key === 'number' && Array.isArray(input)
      ? input.at(key)
      : (input as Record<string, unknown>)[key]

  return getDeep(nestedInput, restOfPath)
}

/**
 * Sets a value deep inside of an object given a path. If the path does not
 * exist in the object, it will be created.
 */
export function setDeep<R>(input: unknown, path: SingleValuePath, value: unknown): R
export function setDeep(input: unknown, path: SingleValuePath, value: unknown): unknown {
  const [currentSegment, ...restOfPath] = path
  if (currentSegment === undefined) return value

  // If the current input is not an object, create a new container.
  if (typeof input !== 'object' || input === null) {
    if (typeof currentSegment === 'string') {
      return {[currentSegment]: setDeep(null, restOfPath, value)}
    }

    let index: number | undefined
    if (isKeySegment(currentSegment)) {
      // When creating a new array via a keyed segment, use index 0.
      index = 0
    } else if (typeof currentSegment === 'number' && currentSegment >= 0) {
      index = currentSegment
    } else {
      // For negative numbers in a non‐object we simply return input.
      return input
    }

    return [
      // fill until index
      ...Array.from({length: index}).fill(null),
      // then set deep here
      setDeep(null, restOfPath, value),
    ]
  }

  // When input is an array…
  if (Array.isArray(input)) {
    let index: number | undefined
    if (isKeySegment(currentSegment)) {
      index = getIndexForKey(input, currentSegment._key)
    } else if (typeof currentSegment === 'number') {
      // Support negative indexes by computing the proper positive index.
      index = currentSegment < 0 ? input.length + currentSegment : currentSegment
    }
    if (index === undefined) return input

    if (index in input) {
      // Update the element at the resolved index.
      return input.map((nestedInput, i) =>
        i === index ? setDeep(nestedInput, restOfPath, value) : nestedInput,
      )
    }

    // Expand the array if needed.
    return [
      ...input,
      ...Array.from({length: index - input.length}).fill(null),
      setDeep(null, restOfPath, value),
    ]
  }

  // For keyed segments that aren’t arrays, do nothing.
  if (typeof currentSegment === 'object') return input

  // For plain objects, update an existing property if it exists…
  if (currentSegment in input) {
    return Object.fromEntries(
      Object.entries(input).map(([key, nestedInput]) =>
        key === currentSegment
          ? [key, setDeep(nestedInput, restOfPath, value)]
          : [key, nestedInput],
      ),
    )
  }

  // ...otherwise create the new nested path.
  return {...input, [currentSegment]: setDeep(null, restOfPath, value)}
}

/**
 * Given an object and an exact path as an array, this unsets the value at the
 * given path.
 */
export function unsetDeep<R>(input: unknown, path: SingleValuePath): R
export function unsetDeep(input: unknown, path: SingleValuePath): unknown {
  const [currentSegment, ...restOfPath] = path
  if (currentSegment === undefined) return input
  if (typeof input !== 'object' || input === null) return input

  let _segment: string | number | undefined
  if (isKeySegment(currentSegment)) {
    _segment = getIndexForKey(input, currentSegment._key)
  } else if (typeof currentSegment === 'string' || typeof currentSegment === 'number') {
    _segment = currentSegment
  }
  if (_segment === undefined) return input

  // For numeric segments in arrays, compute the positive index.
  let segment: string | number = _segment
  if (typeof segment === 'number' && Array.isArray(input)) {
    segment = segment < 0 ? input.length + segment : segment
  }
  if (!(segment in input)) return input

  // If we're at the final segment, remove the property/element.
  if (!restOfPath.length) {
    if (Array.isArray(input)) {
      return input.filter((_nestedInput, index) => index !== segment)
    }
    return Object.fromEntries(Object.entries(input).filter(([key]) => key !== segment.toString()))
  }

  // Otherwise, recurse into the nested value.
  if (Array.isArray(input)) {
    return input.map((nestedInput, index) =>
      index === segment ? unsetDeep(nestedInput, restOfPath) : nestedInput,
    )
  }

  return Object.fromEntries(
    Object.entries(input).map(([key, value]) =>
      key === segment ? [key, unsetDeep(value, restOfPath)] : [key, value],
    ),
  )
}
