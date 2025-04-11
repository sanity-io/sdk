import {getActiveReleasesState, type ReleaseDocument, type SanityInstance} from '@sanity/sdk'
import {filter, firstValueFrom} from 'rxjs'

import {createStateSourceHook} from '../helpers/createStateSourceHook'

/**
 * @public
 */
type UseActiveReleases = {
  (): ReleaseDocument[] | undefined
}

/**
 * @public

 * Returns the active releases for the current project,
 * represented as a list of release documents.
 * 
 * @returns The active releases for the current project.
 *
 */
export const useActiveReleases: UseActiveReleases = createStateSourceHook({
  getState: getActiveReleasesState,
  shouldSuspend: (instance: SanityInstance) =>
    getActiveReleasesState(instance).getCurrent() === undefined,
  suspender: (instance: SanityInstance) =>
    firstValueFrom(getActiveReleasesState(instance).observable.pipe(filter(Boolean))),
})
