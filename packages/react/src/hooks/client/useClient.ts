import {type SanityClient} from '@sanity/client'
import {type ClientOptions, getClient, getSubscribableClient} from '@sanity/sdk'
import {useCallback, useSyncExternalStore} from 'react'

import {useSanityInstance} from '../context/useSanityInstance'

/**
 * A React hook that provides a client that subscribes to changes in your application,
 * such as user authentication changes.
 *
 * @remarks
 * The hook uses `useSyncExternalStore` to safely subscribe to changes
 * and ensure consistency between server and client rendering.
 *
 * @returns A Sanity client
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const client = useClient()
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
export function useClient(options: ClientOptions): SanityClient {
  const instance = useSanityInstance()

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const client$ = getSubscribableClient(instance, options)
      const subscription = client$.subscribe({
        next: onStoreChange,
        error: (error) => {
          // @TODO: We should tackle error handling / error boundaries soon
          // eslint-disable-next-line no-console
          console.error('Error in useClient subscription:', error)
        },
      })
      return () => subscription.unsubscribe()
    },
    [instance, options],
  )

  const getSnapshot = useCallback(() => {
    return getClient(instance, options)
  }, [instance, options])

  return useSyncExternalStore(subscribe, getSnapshot)
}
