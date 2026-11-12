import {useMessageBus} from './useMessageBus'

/**
 * Returns the id this application connected to the Dashboard message bus with, or `null` outside
 * a Dashboard. The Sanity CLI embeds it at build time.
 *
 * `sanity deploy` embeds the deployed application id and `sanity dev` the slug, so pass it to
 * {@link useApplication} to read the application's details. An installed application is listed
 * under its installation id, so `useApplication` returns `null` for it.
 *
 * @example
 * ```tsx
 * function Root({children}: {children: React.ReactNode}) {
 *   const applicationId = useApplicationId()
 *   return applicationId ? <Scoped applicationId={applicationId}>{children}</Scoped> : children
 * }
 *
 * function Scoped({applicationId, children}: {applicationId: string; children: React.ReactNode}) {
 *   const application = useApplication(applicationId)
 *   return <div className={application?.slug ?? undefined}>{children}</div>
 * }
 * ```
 *
 * @public
 * @category Dashboard
 */
export function useApplicationId(): string | null {
  return useMessageBus()?.appId ?? null
}
