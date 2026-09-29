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
  type CommentAnchor,
  type CommentFieldValue,
  type CommentTextSelection,
} from '@sanity/sdk-react/collaboration'
import {type PropsWithChildren, type ReactElement, useMemo} from 'react'

/**
 * Local stand-ins for the comment hooks in `@portabletext/plugin-sdk-comments`,
 * which still reads the deprecated add-on dataset API. They exist so the
 * kitchensink can exercise the two things the collaboration API added for
 * editors — writing an `anchor`, and resolving the `selection` it comes back
 * as — before the plugin moves over. Delete them when it does.
 */

/**
 * The private-use characters the API inserts into a selection's text to mark
 * where the comment starts and ends. Storing marked-up text rather than
 * offsets is what lets a highlight survive edits elsewhere in the block.
 */
const SELECTION_START = '\uF000'
const SELECTION_END = '\uF001'

/** Where an anchor starts and ends, without the `type` and blocks a write needs. */
type AnchorPoints = Pick<CommentAnchor, 'start' | 'end'>

/**
 * Turns a resolved selection back into the points it was anchored at.
 *
 * `undefined` when either sentinel is missing, which means the text the comment
 * was anchored to is no longer there to point at.
 */
function toAnchorPoints(selection: CommentTextSelection): AnchorPoints | undefined {
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

type AnchorPoint = CommentAnchor['start']

/** The editor's own offset shape, narrowed to the `{_key, offset}` an anchor uses. */
function toAnchorPoint(offset: BlockOffset): AnchorPoint | undefined {
  const segment = offset.path[0]

  return isKeyedSegment(segment) ? {_key: segment._key, offset: offset.offset} : undefined
}

function isSamePoint(a: AnchorPoint, b: AnchorPoint): boolean {
  return a._key === b._key && a.offset === b.offset
}

/**
 * The editor's selection as anchor points, or `undefined` when there is nothing
 * to anchor to. A caret counts as nothing: commenting on it would leave the
 * comment covering no text, which the API accepts and nothing can highlight.
 */
function offsetsToAnchorPoints(offsets: {
  start: BlockOffset
  end: BlockOffset
}): AnchorPoints | undefined {
  const start = toAnchorPoint(offsets.start)
  const end = toAnchorPoint(offsets.end)

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
        const points = comment.selection && toAnchorPoints(comment.selection)
        if (!points) return []

        const selection = blockOffsetsToSelection({
          snapshot,
          offsets: {
            anchor: {path: [{_key: points.start._key}], offset: points.start.offset},
            focus: {path: [{_key: points.end._key}], offset: points.end.offset},
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
 * it: an anchor, carrying the blocks its offsets count into.
 *
 * `fieldValue` matters because the offsets describe what is on screen. Without
 * it the API resolves them against the document it holds, which is a different
 * text as soon as someone has typed.
 */
export function useSDKCommentAuthoring(): {anchor: CommentAnchor | undefined} {
  const editor = useEditor()
  const offsets = useEditorSelector(editor, getBlockOffsets)
  const value = useEditorSelector(editor, getValue)

  return useMemo(() => {
    const points = offsets && offsetsToAnchorPoints(offsets)

    return {
      anchor: points
        ? {type: 'portable-text', ...points, fieldValue: value as CommentFieldValue}
        : undefined,
    }
  }, [offsets, value])
}
