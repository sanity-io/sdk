import {createSanityInstance} from '@sanity/sdk'
import {SanityProvider} from '@sanity/sdk-react/components'
import {FunctionComponent} from 'react'

import {Cosui} from './Cosui'

export const CosuiWrapper: FunctionComponent = () => {
  const sanityInstance = createSanityInstance({
    projectId: 'ppsg7ml5',
    dataset: 'test',
  })

  return (
    <SanityProvider sanityInstance={sanityInstance}>
      <Cosui />
    </SanityProvider>
  )
}
