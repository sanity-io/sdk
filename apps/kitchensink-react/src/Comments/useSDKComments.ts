import {
  type BlockOffset,
  type RangeDecoration,
  useEditor,
  useEditorSelector,
} from '@portabletext/editor'
import {getBlockOffsets, getValue} from '@portabletext/editor/selectors'
import {blockOffsetsToSelection, isKeyedSegment} from '@portabletext/editor/utils'
import {
  type Comment,
  type CommentFieldValue,
  type CommentRange,
  type CommentTextSelection,
} from '@sanity/sdk-react/collaboration'
import {type PropsWithChildren, type ReactElement, useMemo} from 'react'

/**
 * Local stand-ins for the comment hooks in `@portabletext/plugin-sdk-comments`,
 * which still reads the deprecated add-on dataset API. They exist so the
 * kitchensink can exercise the two things the collaboration API added for
 * editors — writing a `range`, and resolving the `selection` it comes back as —
 * before the plugin moves over. Delete them when it does.
 */

/**
 * The private-use characters the API inserts into a selection's text to mark
 * where the comment starts and ends. Storing marked-up text rather than
 * offsets is what lets a highlight survive edits elsewhere in the block.
 */
const SELECTION_START = '\uF000'
const SELECTION_END = '\uF001'

/**
 * Turns a resolved selection back into the range it was written from.
 *
 * `undefined` when either sentinel is missing, which means the text the comment
 * was anchored to is no longer there to point at.
 */
function toRange(selection: CommentTextSelection): CommentRange | undefined {
  const startItem = selection.value.find((item) => item.text.includes(SELECTION_START))
  const endItem = selection.value.find((item) => item.text.includes(SELECTION_END))
  if (!startItem || !endItem) return undefined

  const startOffset = startItem.text.indexOf(SELECTION_START)
  const rawEndOffset = endItem.text.indexOf(SELECTION_END)
  // Both sentinels sit in one string when the comment covers part of a single
  // block, so the end offset counts the start sentinel unless it is taken back out.
  const endOffset = startItem === endItem ? rawEndOffset - 1 : rawEndOffset

  return {
    start: {_key: startItem._key, offset: startOffset},
    end: {_key: endItem._key, offset: endOffset},
  }
}

type RangePoint = CommentRange['start']

/** The editor's own offset shape, narrowed to the `{_key, offset}` a range uses. */
function toRangePoint(offset: BlockOffset): RangePoint | undefined {
  const segment = offset.path[0]

  return isKeyedSegment(segment) ? {_key: segment._key, offset: offset.offset} : undefined
}

function isSamePoint(a: RangePoint, b: RangePoint): boolean {
  return a._key === b._key && a.offset === b.offset
}

/**
 * The editor's selection as a range, or `undefined` when there is nothing to
 * anchor to. A caret counts as nothing: commenting on it would leave the
 * comment covering no text, which the API accepts and nothing can highlight.
 */
function offsetsToRange(offsets: {start: BlockOffset; end: BlockOffset}): CommentRange | undefined {
  const start = toRangePoint(offsets.start)
  const end = toRangePoint(offsets.end)

  return start && end && !isSamePoint(start, end) ? {start, end} : undefined
}

/** Where a comment's anchored text currently sits in the editor, if anywhere. */
export function useSDKCommentDecorations({
  comments,
  component,
}: {
  comments: Comment[]
  component: (props: PropsWithChildren) => ReactElement
}): RangeDecoration[] {
  const editor = useEditor()
  const snapshot = useEditorSelector(editor, (editorSnapshot) => editorSnapshot)

  return useMemo(
    () =>
      comments.flatMap((comment) => {
        const range = comment.selection && toRange(comment.selection)
        if (!range) return []

        const selection = blockOffsetsToSelection({
          snapshot,
          offsets: {
            anchor: {path: [{_key: range.start._key}], offset: range.start.offset},
            focus: {path: [{_key: range.end._key}], offset: range.end.offset},
          },
        })
        if (!selection) return []

        return [{selection, component}]
      }),
    [comments, component, snapshot],
  )
}

/**
 * What the current selection has to become for a comment to be written against
 * it: a range, and the blocks that range counts into.
 *
 * `fieldValue` matters because the offsets describe what is on screen. Without
 * it the API resolves them against the document it holds, which is a different
 * text as soon as someone has typed.
 */
export function useSDKCommentAuthoring(): {
  range: CommentRange | undefined
  fieldValue: CommentFieldValue
} {
  const editor = useEditor()
  const offsets = useEditorSelector(editor, getBlockOffsets)
  const value = useEditorSelector(editor, getValue)

  return useMemo(
    () => ({
      range: offsets ? offsetsToRange(offsets) : undefined,
      fieldValue: value as CommentFieldValue,
    }),
    [offsets, value],
  )
}
