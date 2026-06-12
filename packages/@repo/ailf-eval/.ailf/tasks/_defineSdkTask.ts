/**
 * This isn't a task but rather a helper function to define SDK tasks.
 * It emits each literacy task twice: as authored, plus a twin that
 * also injects the App SDK (React) API reference for comparison.
 *
 * Prefer to use `defineSdkTask({...})` instead of `defineTask({...})`. For a
 * literacy task it returns a two-element array:
 *   1. the task exactly as authored (its declared `context.docs`) and
 *   2. `<id>-with-reference` — the same task with the full typedoc reference
 *      appended to `context.docs`
 *
 * A `.task.ts` may `export default` an array, so `export default
 * defineSdkTask({...})` works directly.
 *
 * This shouldn't be used for anything other than literacy tasks.
 */

import {defineTask} from '@sanity/ailf'

type DefinedTask = Parameters<typeof defineTask>[0]
type Task = ReturnType<typeof defineTask>

/**
 * The App SDK (React) typedoc reference document in the docs project
 * (3do82whm). Resolved by `_id` — the authoritative strategy for the
 * `typesReference` doc type (slug/path are informational only). The fetcher
 * derefs its `latestVersion`/`library` and pulls the typedoc JSON, which also
 * powers the grader's deterministic symbol preflight.
 */
const SDK_REACT_REFERENCE = {
  id: '0cd5cd93-ba6a-4180-903b-07027d9a1c17',
  slug: '@sanity/sdk-react',
  reason: 'App SDK (React) API reference — typedoc symbol surface',
} as const

/**
 * Expand a task into its authored form plus an API-reference twin.
 * Non-literacy tasks are returned unchanged (single element).
 */
export function defineSdkTask(task: DefinedTask): Task[] {
  const authored = defineTask(task)
  if (task.mode !== 'literacy') return [authored]

  const twin = defineTask({
    ...task,
    id: `${task.id}-with-reference`,
    ...(task.title ? {title: `${task.title} (with API reference)`} : {}),
    context: {
      ...task.context,
      docs: [...(task.context?.docs ?? []), SDK_REACT_REFERENCE],
    },
  })

  return [authored, twin]
}
