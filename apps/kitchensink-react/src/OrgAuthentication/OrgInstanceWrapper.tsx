import {createSanityInstance} from '@sanity/sdk'
import {SanityProvider} from '@sanity/sdk-react/components'
import {Outlet} from 'react-router'

const sanityInstance = createSanityInstance({
  projectId: '',
  dataset: '',
  auth: {
    authScope: 'org',
  },
})

export function OrgInstanceWrapper(): JSX.Element {
  return (
    <SanityProvider sanityInstance={sanityInstance}>
      <Outlet />
    </SanityProvider>
  )
}
