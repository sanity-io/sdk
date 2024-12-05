import {SanityProvider} from '@sanity/sdk-react/components'
import {Container, Heading, ThemeProvider} from '@sanity/ui'
import {buildTheme} from '@sanity/ui/theme'

import {AuthPlayground} from './AuthPlayground'

const theme = buildTheme({})

export function App(): JSX.Element {
  const config = {projectId: 'ppsg7ml5', dataset: 'test'}
  return (
    <ThemeProvider theme={theme}>
      <SanityProvider config={config}>
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
