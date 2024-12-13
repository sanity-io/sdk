import {createSanityInstance} from '@sanity/sdk'
import {SanityProvider} from '@sanity/sdk-react/components'
import {Flex} from '@sanity/ui'
import {Link, Outlet} from 'react-router'

const sanityInstance = createSanityInstance({
  projectId: 'ppsg7ml5',
  dataset: 'test',
})

export function UnauthenticatedInstanceWrapper(): JSX.Element {
  return (
    <SanityProvider sanityInstance={sanityInstance}>
      <div style={{width: '100%', padding: '0 20px'}}>
        <Flex as="nav" align="center" justify="space-between" paddingY={3}>
          <Link to="/">Kitchen Sink Home</Link>
          <Link to="/unauthenticated">Home</Link>
        </Flex>

        <Outlet />
      </div>
    </SanityProvider>
  )
}
