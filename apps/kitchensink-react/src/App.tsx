import {createSanityInstance} from '@sanity/sdk'
import {SanityProvider} from '@sanity/sdk-react/components'
import {Container, Heading, ThemeProvider} from '@sanity/ui'
import {buildTheme} from '@sanity/ui/theme'

import {AuthPlayground} from './AuthPlayground'

const theme = buildTheme({})
const sanityInstance = createSanityInstance({projectId: 'ppsg7ml5', dataset: 'test'})

export function App(): JSX.Element {
  return (
    <ThemeProvider theme={theme}>
      <SanityProvider sanityInstance={sanityInstance}>
        <Container width={0}>
          <Heading as="h1" size={5} style={{marginBottom: 24}}>
            React Kitchensink
          </Heading>
          <AuthPlayground />
        </Container>
      </SanityProvider>
    </ThemeProvider>
  )
}
