import {createResourceAction} from '../../store/createResource'
import {Auth} from '../newAuthStore'

const DEFAULT_BASE = 'http://localhost'
const AUTH_CODE_PARAM = 'sid'

/**
 * Extracts the auth code (`sid`) from a location, if it matches the callback URL conditions.
 * Returns null if no valid code is found.
 */
export const getAuthCode = createResourceAction(Auth, ({context}) => {
  const {callbackUrl} = context

  return (locationHref: string) => {
    const loc = new URL(locationHref, DEFAULT_BASE)
    const callbackLocation = callbackUrl ? new URL(callbackUrl, DEFAULT_BASE) : undefined
    const callbackLocationMatches = callbackLocation
      ? loc.pathname.toLowerCase().startsWith(callbackLocation.pathname.toLowerCase())
      : true

    const authCode = new URLSearchParams(loc.hash.slice(1)).get(AUTH_CODE_PARAM)
    return authCode && callbackLocationMatches ? authCode : null
  }
})
