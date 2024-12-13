import {createSanityInstance} from '@sanity/sdk'
import {SanityProvider} from '@sanity/sdk-react/components'
import {Outlet} from 'react-router'

const sanityInstance = createSanityInstance({
  projectId: 'ppsg7ml5',
  dataset: 'test',
})

export function ProjectInstanceWrapper(): JSX.Element {
  return (
    <SanityProvider sanityInstance={sanityInstance}>
      <Outlet />
    </SanityProvider>
  )
}
