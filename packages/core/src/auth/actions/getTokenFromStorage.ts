import {createResourceAction} from '../../store/createResource'
import {Auth} from '../newAuthStore'

/**
 * Attempts to retrieve a token from the configured storage.
 * If invalid or not present, returns null.
 */
export const getTokenFromStorage = createResourceAction(Auth, ({context}) => {
  const {storageArea, storageKey} = context

  return () => {
    if (!storageArea) return null
    const item = storageArea.getItem(storageKey)
    if (item === null) return null

    try {
      const parsed: unknown = JSON.parse(item)
      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        !('token' in parsed) ||
        typeof parsed.token !== 'string'
      ) {
        throw new Error('Invalid stored auth data structure')
      }
      return parsed.token
    } catch {
      storageArea.removeItem(storageKey)
      return null
    }
  }
})
