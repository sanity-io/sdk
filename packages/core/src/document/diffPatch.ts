import {makePatches, stringifyPatches} from '@sanity/diff-match-patch'
import {
  isKeyedObject,
  type PatchOperations as AllPatchOperations,
  type Path,
  type SanityDocument,
} from '@sanity/types'

import {stringifyPath} from './patchOperations'

export type PatchOperations = Pick<
  AllPatchOperations,
  'diffMatchPatch' | 'set' | 'setIfMissing' | 'unset' | 'insert'
>

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && !!value && !Array.isArray(value)

const ignoredKeys = ['_id', '_type', '_createdAt', '_updatedAt', '_rev']

export function diffPatch(before: SanityDocument, after: SanityDocument): PatchOperations[] {
  return diffRecursive(before, after, [])
}

/**
 * Recursively diff two values given a current path.
 *
 * The rules are:
 * - If the two values are identical, return no patches.
 * - If the two values are of different types, issue a set patch for the entire path.
 * - If both values are strings, compute a diff–match–patch patch.
 * - If both values are numbers, booleans, null, etc., use a set patch.
 * - If both values are arrays, delegate to diffArray.
 * - If both values are objects then:
 *    - For each key (ignoring keys that start with `_`), if the key is missing in `after` then
 *      issue an unset patch; if extra then a set patch; otherwise, recursively diff.
 */
function diffRecursive(before: unknown, after: unknown, path: Path): PatchOperations[] {
  if (before === after) return []

  const patches: PatchOperations[] = []
  const pathStr = stringifyPath(path)

  // Handle null (remember that typeof null is "object")
  if (before === null || after === null) {
    if (before !== after) {
      patches.push({set: {[pathStr]: after}})
    }
    return patches
  }

  // If types differ (or one is an array and the other isn’t) – replace whole value.
  if (typeof before !== typeof after || Array.isArray(before) !== Array.isArray(after)) {
    patches.push({set: {[pathStr]: after}})
    return patches
  }

  // If both are strings, diff them using diff–match–patch.
  if (typeof before === 'string' && typeof after === 'string') {
    const dmpPatches = makePatches(before, after)
    const patchStr = stringifyPatches(dmpPatches)
    patches.push({diffMatchPatch: {[pathStr]: patchStr}})
    return patches
  }

  // If both are numbers then simply set the value if they differ.
  if (typeof before === 'number' && typeof after === 'number') {
    patches.push({set: {[pathStr]: after}})
    return patches
  }

  // For other primitive values (boolean, undefined, etc.) use strict comparison.
  if (typeof before !== 'object') {
    if (before !== after) {
      patches.push({set: {[pathStr]: after}})
    }
    return patches
  }

  // If both values are arrays, handle with diffArray.
  if (Array.isArray(before) && Array.isArray(after)) {
    patches.push(...diffArray(before, after, path))
    return patches
  }

  if (!isRecord(after) || !isRecord(before)) return patches

  // Both are plain objects.
  const beforeKeys = Object.keys(before).filter((k) => !ignoredKeys.includes(k))
  const afterKeys = Object.keys(after).filter((k) => !ignoredKeys.includes(k))
  const allKeys = new Set([...beforeKeys, ...afterKeys])
  for (const key of allKeys) {
    const subPath = [...path, key]
    if (!(key in after)) {
      // Field removed – unset it.
      patches.push({unset: [stringifyPath(subPath)]})
    } else if (!(key in before)) {
      // Field added – set it.
      patches.push({set: {[stringifyPath(subPath)]: after[key]}})
    } else {
      // Field exists in both – recursively diff.
      patches.push(...diffRecursive(before[key], after[key], subPath))
    }
  }
  return patches
}

/**
 * Diff two arrays.
 *
 * If both arrays are “keyed” (every element is an object with a string `_key` property)
 * then we:
 *
 * 1. Unset any items that were removed (using the keyed path, e.g. `items[_key=="foo"]`).
 * 2. Recursively diff any items that exist in both arrays.
 * 3. For any items in `after` that do not exist in `before`, group them and emit an insert patch.
 *
 * For non–keyed arrays we simply compare indices, unsetting “extra” items from `before` and
 * inserting new items at the end.
 */
function diffArray(beforeArr: unknown[], afterArr: unknown[], path: Path): PatchOperations[] {
  const pathStr = stringifyPath(path)

  // Helper: determine if every element is an object with a `_key` property.
  const isKeyedArray = (arr: unknown[]) => arr.every((item) => isKeyedObject(item))

  // For keyed arrays, we collect patches in three buckets.
  if (isKeyedArray(beforeArr) && isKeyedArray(afterArr)) {
    // SPECIAL FIX: If the array is empty, produce an insert patch that prepends the new items.
    if (beforeArr.length === 0 && afterArr.length > 0) {
      return [
        {
          insert: {
            before: stringifyPath([...path, 0]),
            items: afterArr,
          },
        },
      ]
    }

    const unsetPatches: PatchOperations[] = []
    const diffPatches: PatchOperations[] = []
    const insertPatches: PatchOperations[] = []

    // Build maps from _key → {item, index}
    const beforeMap = new Map<string, {item: unknown; index: number}>()
    beforeArr.forEach((item, index) => {
      // We assume item has a _key because of isKeyedArray.
      beforeMap.set(item._key, {item, index})
    })
    const afterMap = new Map<string, {item: unknown; index: number}>()
    afterArr.forEach((item, index) => {
      afterMap.set(item._key, {item, index})
    })

    // 1. Unset removed items.
    for (const [key] of beforeMap.entries()) {
      if (!afterMap.has(key)) {
        unsetPatches.push({unset: [stringifyPath([...path, {_key: key}])]})
      }
    }

    // 2. Diff items that exist in both arrays.
    for (const [key, {item: afterItem}] of afterMap.entries()) {
      if (beforeMap.has(key)) {
        diffPatches.push(
          ...diffRecursive(beforeMap.get(key)!.item, afterItem, [...path, {_key: key}]),
        )
      }
    }

    // 3. Find contiguous “new” items in `after` and insert them.
    let newItemsGroup: unknown[] = []
    let insertPosition: {op: 'before' | 'after'; refKey: string} | null = null
    for (let i = 0; i < afterArr.length; i++) {
      const item = afterArr[i]
      if (!beforeMap.has(item._key)) {
        // New item.
        if (newItemsGroup.length === 0) {
          if (i === 0) {
            // Look ahead for the first existing item.
            let j = i
            while (j < afterArr.length && !beforeMap.has(afterArr[j]._key)) {
              j++
            }
            if (j < afterArr.length) {
              insertPosition = {op: 'before', refKey: afterArr[j]._key}
            } else if (beforeArr.length > 0) {
              // Fallback: all items are new – use the last before item as anchor.
              insertPosition = {op: 'after', refKey: beforeArr[beforeArr.length - 1]._key}
            }
          } else {
            // Look backward for an existing item.
            let j = i - 1
            while (j >= 0 && !beforeMap.has(afterArr[j]._key)) {
              j--
            }
            if (j >= 0) {
              insertPosition = {op: 'after', refKey: afterArr[j]._key}
            } else {
              // Fallback – look ahead.
              let k = i
              while (k < afterArr.length && !beforeMap.has(afterArr[k]._key)) {
                k++
              }
              if (k < afterArr.length) {
                insertPosition = {op: 'before', refKey: afterArr[k]._key}
              }
            }
          }
        }
        newItemsGroup.push(item)
      } else {
        // Flush any pending group.
        if (newItemsGroup.length > 0 && insertPosition) {
          if (insertPosition.op === 'before') {
            insertPatches.push({
              insert: {
                before: stringifyPath([...path, {_key: insertPosition.refKey}]),
                items: newItemsGroup,
              },
            })
          } else {
            insertPatches.push({
              insert: {
                after: stringifyPath([...path, {_key: insertPosition.refKey}]),
                items: newItemsGroup,
              },
            })
          }
          newItemsGroup = []
          insertPosition = null
        }
      }
    }
    // Flush any remaining group (at the end of the array).
    if (newItemsGroup.length > 0 && insertPosition) {
      if (insertPosition.op === 'after') {
        insertPatches.push({
          insert: {
            after: stringifyPath([...path, {_key: insertPosition.refKey}]),
            items: newItemsGroup,
          },
        })
      } else {
        insertPatches.push({
          insert: {
            before: stringifyPath([...path, {_key: insertPosition.refKey}]),
            items: newItemsGroup,
          },
        })
      }
    }

    // If every item in the "after" array is new (fallback branch) then
    // output the insert patch before the unset patches so that when applied
    // the insert anchor is resolved against the original document.
    const allNew = afterArr.every((item) => !beforeMap.has(item._key))
    if (allNew) {
      return [...insertPatches, ...unsetPatches, ...diffPatches]
    }
    return [...unsetPatches, ...diffPatches, ...insertPatches]
  } else {
    // Non–keyed arrays: diff by index.
    const patches: PatchOperations[] = []
    const minLength = Math.min(beforeArr.length, afterArr.length)
    for (let i = 0; i < minLength; i++) {
      patches.push(...diffRecursive(beforeArr[i], afterArr[i], [...path, i]))
    }
    // Unset extra items from before.
    for (let i = afterArr.length; i < beforeArr.length; i++) {
      patches.push({unset: [stringifyPath([...path, i])]})
    }
    // Insert any extra items from after.
    if (afterArr.length > beforeArr.length) {
      const newItems = afterArr.slice(beforeArr.length)
      if (beforeArr.length > 0) {
        patches.push({
          insert: {after: stringifyPath([...path, beforeArr.length - 1]), items: newItems},
        })
      } else {
        // If the array was empty, simply set the whole array.
        patches.push({set: {[pathStr]: afterArr}})
      }
    }
    return patches
  }
}
