import {
  type ArrayElementNode,
  evaluateSync,
  type ExprNode,
  type ObjectAttributeNode,
  parse,
  type SelectAlternativeNode,
} from 'groq-js'

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

const SAFE: WalkResult = {safe: true, usesIdentity: false}
const UNSAFE: WalkResult = {safe: false, usesIdentity: false}

function combine(results: WalkResult[]): WalkResult {
  return {
    safe: results.every((result) => result.safe),
    usesIdentity: results.some((result) => result.usesIdentity),
  }
}

/** Walk a parsed expression, accepting only nodes whose inputs can all be supplied locally. */
function inspect(node: ExprNode): WalkResult {
  switch (node.type) {
    case 'AccessAttribute':
      return node.base ? inspect(node.base) : SAFE
    case 'AccessElement':
    case 'ArrayCoerce':
    case 'Group':
    case 'Neg':
    case 'Not':
    case 'Pos':
      return inspect(node.base)
    case 'And':
    case 'OpCall':
    case 'Or':
      return combine([inspect(node.left), inspect(node.right)])
    case 'Array':
      return combine(node.elements.map((element: ArrayElementNode) => inspect(element.value)))
    case 'Filter':
      return combine([inspect(node.base), inspect(node.expr)])
    case 'FlatMap':
    case 'Map':
    case 'Projection':
      return combine([inspect(node.base), inspect(node.expr)])
    case 'FuncCall': {
      const name = `${node.namespace}::${node.name}`
      if (!PURE_FUNCTIONS.has(name)) return UNSAFE
      const inspected = combine(node.args.map(inspect))
      return {...inspected, usesIdentity: inspected.usesIdentity || name === 'global::identity'}
    }
    case 'InRange':
      return combine([inspect(node.base), inspect(node.left), inspect(node.right)])
    case 'Object':
      return combine(
        node.attributes.flatMap((attribute: ObjectAttributeNode) => {
          switch (attribute.type) {
            case 'ObjectAttributeValue':
            case 'ObjectSplat':
              return [inspect(attribute.value)]
            case 'ObjectConditionalSplat':
              return [inspect(attribute.condition), inspect(attribute.value)]
            default:
              return [UNSAFE]
          }
        }),
      )
    case 'Select':
      return combine([
        ...node.alternatives.flatMap((alternative: SelectAlternativeNode) => [
          inspect(alternative.condition),
          inspect(alternative.value),
        ]),
        ...(node.fallback ? [inspect(node.fallback)] : []),
      ])
    case 'Slice':
      return inspect(node.base)
    case 'Tuple':
      return combine(node.members.map(inspect))
    case 'Parameter':
    case 'This':
    case 'Value':
      return SAFE
    case 'Asc':
    case 'Context':
    case 'Deref':
    case 'Desc':
    case 'Everything':
    case 'Parent':
    case 'PipeFuncCall':
    case 'SelectorFuncCall':
    case 'SelectorNested':
      return UNSAFE
    default:
      return UNSAFE
  }
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
