import {type SanityInstance, testFunction} from '@sanity/sdk'
import type {ReactElement} from 'react'

/**
 * @public
 */
export const TestComponent = ({sanityInstance}: {sanityInstance: SanityInstance}): ReactElement => {
  const test = testFunction(sanityInstance)
  // eslint-disable-next-line no-console
  console.log(test)
  return <div>Test Component</div>
}
