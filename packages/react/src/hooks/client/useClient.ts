import {getClientState} from '@sanity/sdk'

import {createStateSourceHook} from '../helpers/createStateSourceHook'

/**
 * A React hook that provides a client that subscribes to changes in your application,
 * such as user authentication changes.
 *
 * @remarks
 * The hook uses `useSyncExternalStore` to safely subscribe to changes
 * and ensure consistency between server and client rendering.
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
 */
export const useClient = createStateSourceHook(getClientState)
