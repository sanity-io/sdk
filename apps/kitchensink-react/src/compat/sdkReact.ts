// fallow-ignore-file unused-file -- reached through the `@sanity/sdk-react` Vite alias, not an import
/* eslint-disable no-restricted-imports -- re-exporting the SDK's barrel is the point of this shim */
/**
 * `@portabletext/plugin-sdk-value` imports `useComments`, which the SDK dropped
 * in favour of `useDocumentComments`. No published plugin release targets the
 * new name yet (8.1.3 is the latest and still imports the old one), so the bare
 * `@sanity/sdk-react` specifier is aliased
 * to this module in `sanity.cli.ts`: the plugin resolves, and the SDK's public
 * API keeps the shape the breaking change gave it.
 *
 * Delete this file and its alias once a plugin release reads threads.
 */
import {useMemo} from 'react'

import {type Comment, useDocumentComments} from '../../../../packages/react/src/_exports/index'

export * from '../../../../packages/react/src/_exports/index'

/** The removed hook's result: one flat list, replies included. */
export interface UseCommentsResult {
  comments: Comment[]
  isPending: boolean
}

/**
 * Reads a document's comments as a flat list.
 *
 * @param options - The document to read, as `useDocumentComments` takes it
 * @returns Every matching comment, and whether a switch is in flight
 */
export function useComments(options: Parameters<typeof useDocumentComments>[0]): UseCommentsResult {
  const {threads, isPending} = useDocumentComments(options)

  return useMemo(
    () => ({
      comments: threads.flatMap((thread) => [thread.parentComment, ...thread.replies]),
      isPending,
    }),
    [isPending, threads],
  )
}
