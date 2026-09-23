import {type ApplicationContext} from '@sanity/sdk/dashboard'
import {useEffect} from 'react'

import {useEmit} from './useEmit'

/**
 * Publishes what this application is currently showing to the Dashboard message bus, so the host
 * can hold the foreground application's context. Pass `null` when nothing is open.
 *
 * The context is published on mount and whenever it changes, and cleared with `null` on unmount.
 * A change publishes `null` before the new context, as the component has stopped showing the old
 * one. Pass a memoised value: the hook compares by reference, so a new object on every render
 * republishes on every render.
 *
 * The host reads the sending application from `message.meta.appId`, so the payload carries no
 * application ID.
 *
 * @param context - The application context to publish, or `null` to clear it
 *
 * @example
 * ```tsx
 * import {useApplicationContext} from '@sanity/sdk-react/dashboard'
 * import {useMemo} from 'react'
 *
 * function DocumentView({documentId}: {documentId: string}) {
 *   const context = useMemo(
 *     () => ({resource: {id: 'my-project.production', type: 'dataset' as const}, document: {id: documentId}}),
 *     [documentId],
 *   )
 *   useApplicationContext(context)
 *   return <div>Editing {documentId}</div>
 * }
 * ```
 *
 * @public
 * @category Dashboard
 */
export function useApplicationContext(context: ApplicationContext | null): void {
  const emit = useEmit('applications.context.update')

  useEffect(() => {
    emit(context)
    return () => {
      emit(null)
    }
  }, [emit, context])
}
