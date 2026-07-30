import {type Path, type PathSegment} from '@sanity/types'

/**
 * Compares two path segments.
 *
 * Segments are not always strings, despite what `PresenceLocation.path` declares.
 * Array items arrive as `{_key}` and Portable Text spans as a mix of keys and
 * property names, because that is what the Studio sends. See the note on
 * {@link PresenceLocation.path}.
 */
function isEqualSegment(a: PathSegment, b: PathSegment): boolean {
  if (a === b) return true

  const aKeyed = typeof a === 'object' && a !== null && !Array.isArray(a) && '_key' in a
  const bKeyed = typeof b === 'object' && b !== null && !Array.isArray(b) && '_key' in b
  if (aKeyed && bKeyed) return a._key === b._key

  // Index tuples (`[from, to]`) only occur in slice selections, which presence
  // never reports. Compared structurally rather than assumed absent.
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((value, index) => value === b[index])
  }

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
