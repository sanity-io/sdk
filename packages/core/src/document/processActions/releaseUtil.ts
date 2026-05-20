import {type Action, type ReleaseAction} from '../actions'

/**
 * Path prefix shared by every release document. Matches studio's
 * `RELEASE_DOCUMENTS_PATH` constant.
 */
const RELEASE_DOCUMENTS_PATH = '_.releases'

/**
 * Returns the full release document ID for the given release name.
 * e.g. `getReleaseDocumentId('my-release') === '_.releases.my-release'`
 * @beta
 */
export function getReleaseDocumentId(releaseId: string): string {
  return `${RELEASE_DOCUMENTS_PATH}.${releaseId}`
}

const RELEASE_ACTION_TYPES = new Set([
  'release.create',
  'release.edit',
  'release.publish',
  'release.schedule',
  'release.unschedule',
  'release.archive',
  'release.unarchive',
  'release.delete',
])

export function isReleaseAction(action: Action): action is ReleaseAction {
  return RELEASE_ACTION_TYPES.has(action.type)
}
