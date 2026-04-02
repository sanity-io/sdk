import {type SanityClient} from '@sanity/client'
import {type ClientOptions, getClientState, type SanityInstance} from '@sanity/sdk'

import {createStateSourceHook} from '../helpers/createStateSourceHook'
import {useNormalizedResourceOptions} from '../helpers/useNormalizedResourceOptions'

const useClientValue = createStateSourceHook({
  getState: (instance: SanityInstance, options: ClientOptions) => {
    if (!options || typeof options !== 'object') {
      throw new Error(
        'useClient() requires a configuration object with at least an "apiVersion" property. ' +
          'Example: useClient({ apiVersion: "2024-11-12" })',
      )
    }
    return getClientState(instance, options)
  },
})

/**
 * A React hook that provides a client that subscribes to changes in your application,
 *
 * @remarks
 * This hook is intended for advanced use cases and special API calls that the React SDK
 * does not yet provide hooks for. We welcome you to get in touch with us to let us know
 * your use cases for this!
 *
 * @category Platform
 * @returns A Sanity client
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const client = useClient({apiVersion: '2024-11-12'})
 *   const [document, setDocument] = useState(null)
 *   useEffect(async () => {
 *     const doc = client.fetch('*[_id == "myDocumentId"]')
 *     setDocument(doc)
 *   }, [])
 *  return <div>{JSON.stringify(document) ?? 'Loading...'}</div>
 * }
 * ```
 *
 * @public
 * @function
 */
export const useClient = (options: ClientOptions): SanityClient => {
  const normalizedOptions = useNormalizedResourceOptions((options ?? {}) as ClientOptions)
  // don't conform to a resource if the user has explicitly provided a projectId and dataset
  const clientOptions = options?.projectId && options?.dataset ? options : normalizedOptions
  if (!clientOptions.apiVersion) {
    throw new Error(
      'useClient() requires a configuration object with at least an "apiVersion" property. ' +
        'Example: useClient({ apiVersion: "2024-11-12" })',
    )
  }
  return useClientValue(clientOptions)
}
