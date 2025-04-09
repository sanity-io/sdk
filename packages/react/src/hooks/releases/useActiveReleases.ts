import {getActiveReleasesState, type SanityInstance} from '@sanity/sdk'
import {filter, firstValueFrom} from 'rxjs'

import {createStateSourceHook} from '../helpers/createStateSourceHook'

export const useActiveReleases = createStateSourceHook({
  getState: getActiveReleasesState,
  shouldSuspend: (instance: SanityInstance) =>
    getActiveReleasesState(instance).getCurrent() === undefined,
  suspender: (instance: SanityInstance) =>
    firstValueFrom(getActiveReleasesState(instance).observable.pipe(filter(Boolean))),
})
