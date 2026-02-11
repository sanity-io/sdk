import {type TokenSource} from '@sanity/sdk'
import {createContext} from 'react'

/**
 * Minimal duck-typed interface representing a Sanity Studio workspace.
 * The Studio's `Workspace` type satisfies this naturally — no import
 * dependency on the `sanity` package is required.
 *
 * @public
 */
export interface StudioWorkspaceHandle {
  /** The Sanity project ID for this workspace. */
  projectId: string
  /** The dataset name for this workspace. */
  dataset: string
  /** Authentication state for this workspace. */
  auth: {
    /**
     * Reactive token source from the Studio's auth store.
     * When present, the SDK subscribes for ongoing token sync — the Studio
     * is the single authority for auth and handles token refresh.
     *
     * Optional because Studios before Aug 2022 may not expose it. When
     * absent, the SDK falls back to localStorage/cookie discovery.
     */
    token?: TokenSource
  }
}

/**
 * React context that allows the SDK to auto-detect when it is running
 * inside a Sanity Studio. The Studio provides a workspace handle via this
 * context, and `SanityApp` reads it to derive `projectId`, `dataset`, and
 * a reactive auth token — eliminating the need for manual configuration.
 *
 * @remarks
 * This context is defined in `@sanity/sdk-react` and provided by the Studio.
 * The Studio imports it from this package and wraps its component tree:
 *
 * ```tsx
 * import {SDKStudioContext} from '@sanity/sdk-react'
 *
 * function StudioRoot({children}) {
 *   const workspace = useWorkspace()
 *   return (
 *     <SDKStudioContext.Provider value={workspace}>
 *       {children}
 *     </SDKStudioContext.Provider>
 *   )
 * }
 * ```
 *
 * When `SanityApp` is rendered inside this provider, it auto-configures
 * without any `config` prop:
 *
 * ```tsx
 * <SanityApp fallback={<Loading />}>
 *   <MyComponent />
 * </SanityApp>
 * ```
 *
 * @public
 */
export const SDKStudioContext = createContext<StudioWorkspaceHandle | null>(null)
SDKStudioContext.displayName = 'SDKStudioContext'
