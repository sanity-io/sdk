import {getClientState} from '@sanity/sdk'
import {identity} from 'rxjs'

import {createStateSourceHook} from '../helpers/createStateSourceHook'

/**
 * A React hook that provides a client that subscribes to changes in your application,
 *
 * @remarks
 * This hook is intended for advanced use cases and special API calls that the React SDK
 * does not yet provide hooks for. We welcome to you get in touch with us to let us know
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
export const useClient = createStateSourceHook({
  getState: getClientState,
  getConfig: identity,
})
