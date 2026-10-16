import {evaluateSync, type ExprNode, parse} from 'groq-js'

import {buildListenQuery} from './commentsConstants'
import {type StoredComment} from './types'

/**
 * Whether one comment belongs in a list, answered without asking the server.
 *
 * @internal
 */
export type CommentsMatcher = (
  comment: StoredComment,
  params: Record<string, unknown>,
  identity: string | undefined,
) => boolean

/**
 * Node types that make a filter unsafe to answer locally.
 *
 * Both are evaluated against a dataset holding the one comment being tested. A
 * dereference finds nothing there, and a nested `*[...]` sees only that comment,
 * so either reports no match instead of failing. A wrong `false` is
 * indistinguishable from a comment that genuinely does not belong, so these
 * have to be recognised before the filter is trusted rather than after.
 */
const UNEVALUABLE_NODE_TYPES = new Set(['Deref', 'Everything'])

/** Whether any node in the tree is one the local evaluator cannot answer for. */
function isUnevaluable(node: unknown): boolean {
  if (Array.isArray(node)) return node.some(isUnevaluable)
  if (typeof node !== 'object' || node === null) return false

  const {type} = node as {type?: unknown}
  if (typeof type === 'string' && UNEVALUABLE_NODE_TYPES.has(type)) return true

  return Object.values(node).some(isUnevaluable)
}

function compile(filter: string): CommentsMatcher | undefined {
  let tree: ExprNode
  try {
    tree = parse(buildListenQuery(filter))
  } catch {
    return undefined
  }

  // The query is built here, so the root is a filter over everything unless the
  // caller's own filter changed the shape of it. The root `Everything` is the
  // comment under test; any other one is a subquery that cannot see the store.
  if (tree.type !== 'Filter' || tree.base.type !== 'Everything') return undefined
  if (isUnevaluable(tree.expr)) return undefined

  return (comment, params, identity) => {
    try {
      const value = evaluateSync(tree, {dataset: [comment], params, identity})
      return value.type === 'array' && value.data.length > 0
    } catch {
      // The filter parsed and the server accepted it, so this is not expected.
      // Reporting no match leaves the list following the server, which is where
      // it stood before any of this.
      return false
    }
  }
}

/**
 * Filters come from entry keys, so the set in play is small and recurring. The
 * cap is only here so that a caller building a filter per render cannot grow
 * this without bound.
 */
const CACHE_LIMIT = 100
const cache = new Map<string, CommentsMatcher | undefined>()

/**
 * A filter prepared for matching comments locally, or `undefined` when it has to
 * be left to the server.
 *
 * Parsing is cached per filter, so repeated calls for the same list are cheap.
 *
 * @internal
 */
export function compileCommentsFilter(filter: string): CommentsMatcher | undefined {
  if (cache.has(filter)) return cache.get(filter)

  const matcher = compile(filter)
  if (cache.size >= CACHE_LIMIT) cache.clear()
  cache.set(filter, matcher)
  return matcher
}
