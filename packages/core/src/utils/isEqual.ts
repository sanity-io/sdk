/**
 * Deep equality check for JSON-like values (primitives, plain objects, arrays).
 *
 * This does NOT handle Sets, Maps, Dates, RegExps, typed arrays, or circular
 * references - it covers the subset of types actually used in the SDK.
 *
 * @internal
 */
export function isEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a == null || b == null) return a === b
  if (typeof a !== typeof b) return false

  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
      if (!isEqual(a[i], b[i])) return false
    }
    return true
  }

  if (isRecord(a) && isRecord(b)) {
    const keysA = Object.keys(a)
    const keysB = Object.keys(b)
    if (keysA.length !== keysB.length) return false
    for (const key of keysA) {
      if (!Object.hasOwn(b, key) || !isEqual(a[key], b[key])) return false
    }
    return true
  }

  return false
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
