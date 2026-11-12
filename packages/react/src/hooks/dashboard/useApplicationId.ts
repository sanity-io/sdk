declare const __SANITY_APP_ID__: string | undefined

/**
 * Returns the id the Sanity CLI embedded in this application at build time, or `null` when it was
 * built without one.
 *
 * `sanity deploy` embeds the deployed application id and `sanity dev` the slug, so pass it to
 * {@link useApplication} to read the application's details. An installed application is listed
 * under its installation id, so `useApplication` returns `null` for it.
 *
 * @example
 * ```tsx
 * function Root({children}: {children: React.ReactNode}) {
 *   const application = useApplication(useApplicationId() ?? '')
 *   return <div className={application?.slug ?? undefined}>{children}</div>
 * }
 * ```
 *
 * @public
 * @category Dashboard
 */
export function useApplicationId(): string | null {
  return typeof __SANITY_APP_ID__ === 'string' ? __SANITY_APP_ID__ : null
}
