import {makePatches, stringifyPatches} from '@sanity/diff-match-patch'
import {isKeyedObject, type KeyedObject} from '@sanity/types'

export type InsertPatch =
  | {before: string; items: unknown[]}
  | {after: string; items: unknown[]}
  | {replace: string; items: unknown[]}

type InsertAfterPatch = Extract<InsertPatch, {after: string}>
type InsertBeforePatch = Extract<InsertPatch, {before: string}>
type InsertReplacePatch = Extract<InsertPatch, {replace: string}>

export type PatchOperations =
  | {set?: {[path: string]: unknown}}
  | {setIfMissing?: {[path: string]: unknown}}
  | {diffMatchPatch?: {[path: string]: string}}
  | {unset?: string[]}
  | {insert?: InsertPatch}

export function createPatchFromDiff(before: unknown, after: unknown): PatchOperations[] {
  const patches: PatchOperations[] = []
  diffValues(before, after, '', patches)
  return patches
}

function diffValues(
  beforeVal: unknown,
  afterVal: unknown,
  path: string,
  patches: PatchOperations[],
): void {
  if (deepEqual(beforeVal, afterVal)) {
    return
  }

  if (
    typeof beforeVal !== typeof afterVal ||
    Array.isArray(beforeVal) !== Array.isArray(afterVal) ||
    (beforeVal === null) !== (afterVal === null)
  ) {
    addSet(path, afterVal, patches)
    return
  }

  if (Array.isArray(beforeVal) && Array.isArray(afterVal)) {
    diffArrays(beforeVal, afterVal, path, patches)
  } else if (isObject(beforeVal) && isObject(afterVal)) {
    diffObjects(beforeVal, afterVal, path, patches)
  } else if (typeof beforeVal === 'string' && typeof afterVal === 'string') {
    addDiffMatchPatch(path, beforeVal, afterVal, patches)
  } else {
    addSet(path, afterVal, patches)
  }
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return a === b

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false
    }
    return true
  }

  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  if (aKeys.length !== bKeys.length) return false
  for (const key of aKeys) {
    if (!bKeys.includes(key) || !deepEqual(a[key as keyof typeof a], b[key as keyof typeof b])) {
      return false
    }
  }
  return true
}

function isObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val)
}

function diffArrays(
  beforeArr: unknown[],
  afterArr: unknown[],
  path: string,
  patches: PatchOperations[],
): void {
  const beforeHasKeys = beforeArr.every(isKeyedObject)
  const afterHasKeys = afterArr.every(isKeyedObject)

  if (beforeHasKeys && afterHasKeys) {
    diffArrayByKey(beforeArr, afterArr, path, patches)
  } else {
    diffArrayByIndex(beforeArr, afterArr, path, patches)
  }
}

function diffArrayByKey(
  beforeArr: Array<KeyedObject>,
  afterArr: Array<KeyedObject>,
  path: string,
  patches: PatchOperations[],
): void {
  const beforeMap = new Map<string, Record<string, unknown>>(
    beforeArr.map((item) => [item._key as string, item]),
  )
  const afterMap = new Map<string, Record<string, unknown>>(
    afterArr.map((item) => [item._key as string, item]),
  )

  beforeArr.forEach((item) => {
    const key = item._key as string
    if (!afterMap.has(key)) {
      addUnset(`${path}[_key="${key}"]`, patches)
    }
  })

  afterArr.forEach((item, indexInAfter) => {
    const key = item._key as string
    if (!beforeMap.has(key)) {
      let insertType: 'before' | 'after' | 'replace' = 'replace'
      let referenceKey: string | undefined

      for (let i = indexInAfter - 1; i >= 0; i--) {
        const prevKey = afterArr[i]._key as string
        if (beforeMap.has(prevKey)) {
          insertType = 'after'
          referenceKey = prevKey
          break
        }
      }

      if (!referenceKey) {
        for (let i = indexInAfter + 1; i < afterArr.length; i++) {
          const nextKey = afterArr[i]._key as string
          if (beforeMap.has(nextKey)) {
            insertType = 'before'
            referenceKey = nextKey
            break
          }
        }
      }

      const insertOp: Partial<InsertPatch> = {items: [item]}
      if (referenceKey) {
        if (insertType === 'after') {
          ;(insertOp as InsertAfterPatch).after = `${path}[_key="${referenceKey}"]`
        } else {
          ;(insertOp as InsertBeforePatch).before = `${path}[_key="${referenceKey}"]`
        }
      } else {
        if (beforeArr.length === 0) {
          ;(insertOp as InsertReplacePatch).replace = path
        } else {
          const lastBeforeKey = beforeArr[beforeArr.length - 1]._key as string
          ;(insertOp as InsertAfterPatch).after = `${path}[_key="${lastBeforeKey}"]`
        }
      }

      addInsert(insertOp as InsertPatch, patches)
    } else {
      const existingBeforeItem = beforeMap.get(key)!
      diffValues(existingBeforeItem, item, `${path}[_key="${key}"]`, patches)
    }
  })
}

function diffArrayByIndex(
  beforeArr: unknown[],
  afterArr: unknown[],
  path: string,
  patches: PatchOperations[],
): void {
  const maxLength = Math.max(beforeArr.length, afterArr.length)

  for (let i = 0; i < maxLength; i++) {
    const currentPath = path ? `${path}[${i}]` : `[${i}]`

    if (i >= afterArr.length) {
      addUnset(currentPath, patches)
    } else if (i >= beforeArr.length) {
      let insertOp: InsertPatch
      if (i === 0) {
        insertOp = {before: path ? `${path}[0]` : '[0]', items: [afterArr[i]]}
      } else {
        const insertAfterIndex = i - 1
        const insertAfterPath = path ? `${path}[${insertAfterIndex}]` : `[${insertAfterIndex}]`
        insertOp = {after: insertAfterPath, items: [afterArr[i]]}
      }
      addInsert(insertOp, patches)
    } else {
      diffValues(beforeArr[i], afterArr[i], currentPath, patches)
    }
  }
}

function diffObjects(
  beforeObj: Record<string, unknown>,
  afterObj: Record<string, unknown>,
  path: string,
  patches: PatchOperations[],
): void {
  const allKeys = new Set(
    [...Object.keys(beforeObj), ...Object.keys(afterObj)].filter((key) => !key.startsWith('_')),
  )

  allKeys.forEach((key) => {
    const currentPath = path ? `${path}.${key}` : key

    if (!(key in afterObj)) {
      addUnset(currentPath, patches)
    } else if (!(key in beforeObj)) {
      addSet(currentPath, afterObj[key], patches)
    } else {
      diffValues(beforeObj[key], afterObj[key], currentPath, patches)
    }
  })
}

function addSet(path: string, value: unknown, patches: PatchOperations[]): void {
  patches.push({set: {[path]: value}})
}

function addUnset(path: string, patches: PatchOperations[]): void {
  patches.push({unset: [path]})
}

function addInsert(insertOp: InsertPatch, patches: PatchOperations[]): void {
  patches.push({insert: insertOp})
}

function addDiffMatchPatch(
  path: string,
  beforeStr: string,
  afterStr: string,
  patches: PatchOperations[],
): void {
  const dmpPatches = makePatches(beforeStr, afterStr)
  const patchStr = stringifyPatches(dmpPatches)
  patches.push({diffMatchPatch: {[path]: patchStr}})
}
