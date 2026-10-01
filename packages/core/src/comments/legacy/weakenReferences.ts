function weaken(node: unknown): unknown {
  if (Array.isArray(node)) {
    return node.map(weaken)
  }

  if (node && typeof node === 'object') {
    if ('_ref' in node) {
      return {...node, _weak: true}
    }

    return Object.fromEntries(Object.entries(node).map(([key, value]) => [key, weaken(value)]))
  }

  return node
}

/**
 * Marks every reference in a content snapshot weak.
 *
 * A comment's snapshot is written into the addon dataset, but its references
 * point at documents in the main one. Left strong, Content Lake would refuse to
 * delete any document a snapshot happens to mention, so an old comment could
 * pin a document forever.
 *
 * @internal
 */
export function weakenReferencesInContentSnapshot(snapshot: unknown): unknown {
  return weaken(snapshot)
}
