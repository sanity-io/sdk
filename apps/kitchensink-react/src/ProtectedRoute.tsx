import {useAuthState} from '@sanity/sdk-react'
import {type JSX} from 'react'
import {Navigate} from 'react-router'

import {AppShell} from './AppShell'

/**
 * Redirects logged-out users to `subPath` and wraps authenticated routes in
 * the kitchen sink app shell.
 */
export function ProtectedRoute({subPath}: {subPath: string}): JSX.Element {
  const authState = useAuthState()

  if (authState.type !== 'logged-in') {
    return <Navigate to={subPath} replace />
  }

  return <AppShell />
}
