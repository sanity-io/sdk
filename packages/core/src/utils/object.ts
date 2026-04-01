/**
 * Returns true when the input is a non-null object.
 *
 * @internal
 */
export function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null
}

const hasOwn = (value: object, key: PropertyKey) => Object.prototype.hasOwnProperty.call(value, key)

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (!isObject(value)) return false

  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

/**
 * Creates a shallow copy without the provided property.
 *
 * @internal
 */
export function omitProperty<T extends object, K extends keyof T>(
  value: T | null | undefined,
  key: K,
): Omit<T, K> {
  if (!value) return {} as Omit<T, K>

  const {[key]: _omitted, ...rest} = value
  return rest
}

/**
 * Creates a shallow copy containing only the provided properties.
 *
 * @internal
 */
export function pickProperties<T extends object, K extends keyof T>(
  value: T,
  keys: readonly K[],
): Pick<T, K> {
  const result = {} as Pick<T, K>

  for (const key of keys) {
    if (hasOwn(value, key)) {
      result[key] = value[key]
    }
  }

  return result
}

const areSetsEqual = (left: Set<unknown>, right: Set<unknown>): boolean => {
  if (left.size !== right.size) return false

  const unmatched = [...right]

  outer: for (const leftValue of left) {
    for (let index = 0; index < unmatched.length; index++) {
      if (isDeepEqual(leftValue, unmatched[index])) {
        unmatched.splice(index, 1)
        continue outer
      }
    }

    return false
  }

  return unmatched.length === 0
}

const areMapsEqual = (left: Map<unknown, unknown>, right: Map<unknown, unknown>): boolean => {
  if (left.size !== right.size) return false

  const unmatched = [...right.entries()]

  outer: for (const [leftKey, leftValue] of left) {
    for (let index = 0; index < unmatched.length; index++) {
      const [rightKey, rightValue] = unmatched[index]

      if (isDeepEqual(leftKey, rightKey) && isDeepEqual(leftValue, rightValue)) {
        unmatched.splice(index, 1)
        continue outer
      }
    }

    return false
  }

  return unmatched.length === 0
}

/**
 * Compares values deeply across the plain object, array, map, and set shapes used by the SDK.
 * This helper is intended for acyclic SDK data structures and does not guard against circular
 * references.
 *
 * @internal
 */
export function isDeepEqual<T>(left: T, right: T): boolean {
  if (Object.is(left, right)) return true

  if (!isObject(left) || !isObject(right)) return false

  if (left instanceof Date && right instanceof Date) {
    return left.getTime() === right.getTime()
  }

  if (left instanceof RegExp && right instanceof RegExp) {
    return left.source === right.source && left.flags === right.flags
  }

  if (left instanceof Set && right instanceof Set) {
    return areSetsEqual(left, right)
  }

  if (left instanceof Map && right instanceof Map) {
    return areMapsEqual(left, right)
  }

  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false

    return left.every((value, index) => isDeepEqual(value, right[index]))
  }

  if (!isPlainObject(left) || !isPlainObject(right)) return false

  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)

  if (leftKeys.length !== rightKeys.length) return false

  for (const key of leftKeys) {
    if (!hasOwn(right, key) || !isDeepEqual(left[key], right[key])) {
      return false
    }
  }

  return true
}
