import {type IndexTuple, type KeyedSegment, type Path, type PathSegment} from '@sanity/types'

/**
 * Segments are not always strings, despite what `PresenceLocation.path` declares.
 * Array items arrive as `{_key}` and Portable Text spans as a mix of keys and
 * property names, because that is what the Studio sends.
 */
function isKeyedSegment(segment: PathSegment): segment is KeyedSegment {
  return (
    typeof segment === 'object' && segment !== null && !Array.isArray(segment) && '_key' in segment
  )
}

/**
 * Index tuples (`[from, to]`) only occur in slice selections, which presence never
 * reports. Compared structurally rather than assumed absent.
 */
function isEqualTuple(a: IndexTuple, b: IndexTuple): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index])
}

/** Compares two path segments, whatever shape they arrive in. */
function isEqualSegment(a: PathSegment, b: PathSegment): boolean {
  if (a === b) return true
  if (isKeyedSegment(a) && isKeyedSegment(b)) return a._key === b._key
  if (Array.isArray(a) && Array.isArray(b)) return isEqualTuple(a, b)
  return false
}

/**
 * True when `candidate` is at or below `prefix` in the document tree.
 *
 * Equivalent to `startsWith` from the Studio's `@sanity/util/paths`, which is not
 * an SDK dependency.
 *
 * @internal
 */
export function startsWithPath(prefix: Path, candidate: Path): boolean {
  if (prefix.length > candidate.length) return false
  return prefix.every((segment, index) => isEqualSegment(segment, candidate[index]))
}
