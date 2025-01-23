import {type ReactElement} from 'react'

import {useAuthState} from '../../hooks/auth/useAuthState'
import {useHandleCallback} from '../../hooks/auth/useHandleCallback'
import {useLoginUrls} from '../../hooks/auth/useLoginUrls'

/**
 * Component that handles Sanity authentication flow and renders login provider options
 *
 * @public
 *
 * @returns Rendered component
 *
 * @remarks
 * The component handles three states:
 * 1. Loading state during token exchange
 * 2. Success state after successful authentication
 * 3. Provider selection UI when not authenticated
 *
 * @example
 * ```tsx
 * const config = { projectId: 'your-project-id', dataset: 'production' }
 * return <LoginLinks sanityInstance={config} />
 * ```
 */
export const LoginLinks = (): ReactElement => {
  const loginUrls = useLoginUrls()
  const authState = useAuthState()
  useHandleCallback()

  if (authState.type === 'logging-in') {
    return <div className="sc-login-links__logging-in">Logging in...</div>
  }

  // Show success state after authentication
  if (authState.type === 'logged-in') {
    return <div className="sc-login-links__logged-in">You are logged in</div>
  }

  /**
   * Render provider selection UI
   */
  return (
    <div className="sc-login-links">
      <h2 className="sc-login-links__title">Choose login provider</h2>

      <ul className="sc-login-links__list">
        {loginUrls.map((provider, index) => (
          <li key={`${provider.url}_${index}`} className="sc-login-links__item">
            <a href={provider.url} className="sc-login-links__link">
              {provider.title}
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}
