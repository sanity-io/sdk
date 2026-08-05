import {stringifyPath} from '@sanity/json-match'
import {type Path} from '@sanity/types'

/** A dotted segment GROQ would read as a literal rather than a field name. */
const RESERVED_SEGMENT = /\.(true|false|null)(?=$|[.[])/g

/**
 * One quoted string, or one run of text containing no quote at all. Splitting on
 * this is what keeps the rewrite below out of `[_key=="..."]` values.
 */
const QUOTED_OR_PLAIN = /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^"']+/g

function quoteReservedFieldSegments(path: string): string {
  return path.replace(QUOTED_OR_PLAIN, (chunk) =>
    chunk.startsWith('"') || chunk.startsWith("'")
      ? chunk
      : chunk.replace(RESERVED_SEGMENT, '["$1"]'),
  )
}

/**
 * Normalises a field path to the string form comments are stored in.
 *
 * Comments keep `target.path.field` as a string rather than a path array,
 * because that is what the Studio writes and reading it back has to match
 * exactly. A string given here is parsed and re-stringified, so both a path
 * array and a hand-written string come out in the same canonical form.
 *
 * `undefined` and `[]` both produce `''`, which is how a document-level thread
 * is addressed.
 *
 * @example
 * ```ts
 * toCommentFieldPath(['body', {_key: 'intro'}, 'content'])
 * // 'body[_key=="intro"].content'
 * toCommentFieldPath(undefined)
 * // ''
 * ```
 *
 * @beta
 */
export function toCommentFieldPath(path?: string | Path): string {
  return quoteReservedFieldSegments(stringifyPath(path))
}
