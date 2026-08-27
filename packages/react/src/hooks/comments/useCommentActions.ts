import {
  addReaction,
  type Comment,
  createComment,
  type CreateCommentOptions,
  type DocumentResource,
  type PerspectiveHandle,
  type ReactionOptions,
  removeComment,
  type RemoveCommentOptions,
  removeReaction,
  replyToComment,
  type ReplyToCommentOptions,
  setCommentStatus,
  type SetCommentStatusOptions,
  updateComment,
  type UpdateCommentOptions,
  updateCommentRange,
  type UpdateCommentRangeOptions,
} from '@sanity/sdk'
import {useContext, useMemo} from 'react'

import {PerspectiveContext} from '../../context/PerspectiveContext'
import {ResourcesContext} from '../../context/ResourcesContext'
import {useSanityInstance} from '../context/useSanityInstance'
import {
  normalizeResourceOptions,
  useEffectiveContextResource,
  type WithResourceNameSupport,
} from '../helpers/useNormalizedResourceOptions'
import {trackHookUsage} from '../helpers/useTrackHookUsage'

/**
 * @public
 * @category Types
 */
export interface CommentActions {
  /** Starts a thread on one of a document's fields. */
  createComment: (options: WithResourceNameSupport<CreateCommentOptions>) => Promise<Comment>
  /** Adds a reply to an existing thread. */
  replyToComment: (options: WithResourceNameSupport<ReplyToCommentOptions>) => Promise<Comment>
  /** Rewrites a comment's message. */
  updateComment: (options: WithResourceNameSupport<UpdateCommentOptions>) => Promise<void>
  /**
   * Re-anchors a comment to a different run of text, without marking it edited.
   */
  updateCommentRange: (options: WithResourceNameSupport<UpdateCommentRangeOptions>) => Promise<void>
  /** Resolves or reopens a thread. Pass the thread's first comment. */
  setCommentStatus: (options: WithResourceNameSupport<SetCommentStatusOptions>) => Promise<void>
  /** Deletes a comment, and its replies when it starts a thread. */
  removeComment: (options: WithResourceNameSupport<RemoveCommentOptions>) => Promise<void>
  /** Adds the current user's reaction to a comment. */
  addReaction: (options: WithResourceNameSupport<ReactionOptions>) => Promise<void>
  /** Removes the current user's reaction from a comment. */
  removeReaction: (options: WithResourceNameSupport<ReactionOptions>) => Promise<void>
}

type Resolvable = {
  resource?: DocumentResource
  resourceName?: string
  projectId?: string
  dataset?: string
  perspective?: PerspectiveHandle['perspective']
}

/**
 * Returns the comment write actions, bound to the current instance.
 *
 * Each writes optimistically: the change shows immediately and is rolled back
 * if the server rejects it, so an app can render straight from
 * {@link useDocumentComments} without tracking pending state itself.
 *
 * Creating is the exception, and `replyToComment` counts as creating. A comment
 * that fails to post stays on screen carrying `state.createError` rather than
 * disappearing, so passing the same `commentId` again retries it instead of
 * losing what someone typed.
 *
 * The resource is resolved when an action is called rather than when the hook
 * runs, so one set of callbacks works across several resources. Pass `resource`
 * or `resourceName` per call to choose; otherwise the surrounding
 * `ResourceProvider` decides. Every action needs an organization, from
 * `collaboration.organizationId` on the config or on the call.
 *
 * @category Comments
 * @function
 * @returns The write actions
 *
 * @example Resolve a thread
 * ```tsx
 * function ResolveButton({commentId}: {commentId: string}) {
 *   const {setCommentStatus} = useCommentActions()
 *
 *   return (
 *     <button onClick={() => setCommentStatus({commentId, status: 'resolved'})}>
 *       Resolve
 *     </button>
 *   )
 * }
 * ```
 *
 * @public
 */
export function useCommentActions(): CommentActions {
  const instance = useSanityInstance()
  trackHookUsage(instance, 'useCommentActions')

  const resources = useContext(ResourcesContext)
  const contextResource = useEffectiveContextResource()
  const contextPerspective = useContext(PerspectiveContext)

  return useMemo(() => {
    const resolve = <T extends Resolvable>(options: T) =>
      normalizeResourceOptions(options, resources, contextResource, contextPerspective)

    return {
      createComment: (options) => createComment(instance, resolve(options)),
      replyToComment: (options) => replyToComment(instance, resolve(options)),
      updateComment: (options) => updateComment(instance, resolve(options)),
      updateCommentRange: (options) => updateCommentRange(instance, resolve(options)),
      setCommentStatus: (options) => setCommentStatus(instance, resolve(options)),
      removeComment: (options) => removeComment(instance, resolve(options)),
      addReaction: (options) => addReaction(instance, resolve(options)),
      removeReaction: (options) => removeReaction(instance, resolve(options)),
    }
  }, [contextPerspective, contextResource, instance, resources])
}
