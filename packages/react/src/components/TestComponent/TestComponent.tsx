import {getClient, type SanityInstance} from '@sanity/sdk'
import type {ReactElement} from 'react'

/**
 * @public
 */
export const TestComponent = (sanityInstance: SanityInstance): ReactElement => {
  const client = getClient({apiVersion: 'v2024-11-22'}, sanityInstance)
  // eslint-disable-next-line no-console
  console.log(client)
  return <div>Test Component</div>
}
