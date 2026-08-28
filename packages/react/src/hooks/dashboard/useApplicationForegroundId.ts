import {useTopic} from './useTopic'

/**
 * Reads the foreground dashboard application id.
 * @public
 */
export function useApplicationForegroundId(): string | null | undefined {
  return useTopic('applications.foreground')
}
