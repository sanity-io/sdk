import {type DocumentSource, getPerspectiveState, type PerspectiveHandle} from '@sanity/sdk'
import {useContext, useMemo} from 'react'

import {PerspectiveContext} from '../../context/PerspectiveContext'
import {useSanityInstanceAndSource} from '../context/useSanityInstance'
import {useStoreState} from '../helpers/useStoreState'

/**
 * @public
 */
type UsePerspective = {
  (perspectiveHandle: PerspectiveHandle & {source?: DocumentSource}): string | string[]
}

/**
 * @public
 * @function
 *
 * Returns a single or stack of perspectives for the given perspective handle,
 * which can then be used to correctly query the documents
 * via the `perspective` parameter in the client.
 *
 * @param perspectiveHandle - The perspective handle to get the perspective for.
 * @category Documents
 * @example
 * ```tsx
 * import {usePerspective, useQuery} from '@sanity/sdk-react'

 * const perspective = usePerspective({perspective: 'rxg1346'})
 * const {data} = useQuery<Movie[]>('*[_type == "movie"]', {
 *   perspective: perspective,
 * })
 * ```
 *
 * @returns The perspective for the given perspective handle.
 */
export const usePerspective: UsePerspective = ({perspective, source}) => {
  const [instance, actualSource] = useSanityInstanceAndSource({source})
  const contextPerspective = useContext(PerspectiveContext)

  const actualPerspective = perspective ?? contextPerspective ?? 'drafts'

  const state = useMemo(
    () => getPerspectiveState(instance, {perspective: actualPerspective, source: actualSource}),
    [instance, actualPerspective, actualSource],
  )

  return useStoreState(state)
}
