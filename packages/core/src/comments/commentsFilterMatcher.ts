import {evaluateSync, type ExprNode, type FuncCallNode, parse} from 'groq-js'

import {buildListenQuery} from './commentsConstants'
import {type StoredComment} from './types'

/**
 * Whether one comment belongs in a list, or cannot be answered locally.
 *
 * @internal
 */
export type CommentsMatch = boolean | undefined

/**
 * Whether one comment belongs in a list, answered without asking the server.
 *
 * `undefined` means local evaluation cannot be trusted for this event.
 *
 * @internal
 */
export type CommentsMatcher = (
  comment: StoredComment,
  params: Record<string, unknown>,
  identity: string | undefined,
) => CommentsMatch

/**
 * Functions safe to answer against a single comment. Add only functions whose
 * result depends solely on their arguments and `@`, never on the dataset, the
 * clock, releases or any other context the local evaluation does not have.
 */
const PURE_FUNCTIONS = new Set([
  'global::coalesce',
  'global::count',
  'global::dateTime',
  'global::defined',
  'global::identity',
  'global::length',
  'global::lower',
  'global::path',
  'global::references',
  'global::round',
  'global::string',
  'global::upper',
  'string::lower',
  'string::split',
  'string::startsWith',
  'string::upper',
  'array::compact',
  'array::intersects',
  'array::join',
  'array::unique',
  'pt::text',
])

type WalkResult = {safe: boolean; usesIdentity: boolean}

const UNSAFE: WalkResult = {safe: false, usesIdentity: false}

/**
 * Node types whose inputs can all be supplied by `@` and the params. Everything
 * else is refused, including `*` (a subquery), `->`, `^`, context nodes,
 * ordering, pipe functions and `anywhere()`, as well as any node type a later
 * groq-js might add.
 */
const SAFE_NODES = new Set<string>([
  'AccessAttribute',
  'AccessElement',
  'And',
  'Array',
  'ArrayCoerce',
  'ArrayElement',
  'Filter',
  'FlatMap',
  'FuncCall',
  'Group',
  'InRange',
  'Map',
  'Neg',
  'Not',
  'Object',
  'ObjectAttributeValue',
  'ObjectConditionalSplat',
  'ObjectSplat',
  'OpCall',
  'Or',
  'Parameter',
  'Pos',
  'Projection',
  'Select',
  'SelectAlternative',
  'Slice',
  'This',
  'Tuple',
  'Value',
])

function isNode(value: unknown): value is {type: string} {
  return (
    typeof value === 'object' && value !== null && typeof Reflect.get(value, 'type') === 'string'
  )
}

/** Walk a parsed expression, accepting only nodes whose inputs can all be supplied locally. */
function inspect(node: {type: string}): WalkResult {
  if (!SAFE_NODES.has(node.type)) return UNSAFE
  // A literal's value is data, not syntax, even when it has a `type` key.
  if (node.type === 'Value') return {safe: true, usesIdentity: false}

  let usesIdentity = false
  if (node.type === 'FuncCall') {
    const {namespace, name} = node as FuncCallNode
    const qualified = `${namespace}::${name}`
    if (!PURE_FUNCTIONS.has(qualified)) return UNSAFE
    usesIdentity = qualified === 'global::identity'
  }

  for (const field of Object.values(node)) {
    for (const child of Array.isArray(field) ? field : [field]) {
      if (typeof child !== 'object' || child === null) continue
      // Fail closed on a child that is not a node we can recognise.
      if (!isNode(child)) return UNSAFE
      const result = inspect(child)
      if (!result.safe) return UNSAFE
      usesIdentity ||= result.usesIdentity
    }
  }
  return {safe: true, usesIdentity}
}

function compile(filter: string): CommentsMatcher | undefined {
  let tree: ExprNode
  try {
    tree = parse(buildListenQuery(filter))
  } catch {
    return undefined
  }

  // The root `Everything` is the comment under test. Any one inside the filter
  // would be a subquery against a dataset that is not available locally.
  if (tree.type !== 'Filter' || tree.base.type !== 'Everything') return undefined
  const inspection = inspect(tree.expr)
  if (!inspection.safe) return undefined

  return (comment, params, identity) => {
    // Until auth has loaded, null is not a trustworthy value for identity().
    if (inspection.usesIdentity && !identity) return undefined

    try {
      const value = evaluateSync(tree, {dataset: [comment], params, identity})
      return value.type === 'array' && value.data.length > 0
    } catch {
      return undefined
    }
  }
}

/** Filters recur across events, so retain their parsed matchers within a bounded cache. */
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
