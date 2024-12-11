import {createSanityInstance} from '@sanity/sdk'
import {AuthBoundary, SanityProvider} from '@sanity/sdk-react/components'
import {useCurrentUser, useLogOut} from '@sanity/sdk-react/hooks'
import {Button, Flex, Spinner, Text, ThemeProvider} from '@sanity/ui'
import {buildTheme} from '@sanity/ui/theme'
import {Suspense} from 'react'

const theme = buildTheme({})
const sanityInstance = createSanityInstance({
  projectId: 'ppsg7ml5',
  dataset: 'test',
})

export function App(): JSX.Element {
  return (
    <ThemeProvider theme={theme}>
      <Suspense fallback={<Spinner />}>
        <SanityProvider sanityInstance={sanityInstance}>
          <AuthBoundary header={<Text>SDK Kitchen Sink</Text>}>
            <Authenticated />
          </AuthBoundary>
        </SanityProvider>
      </Suspense>
    </ThemeProvider>
  )
}

function Authenticated() {
  const currentUser = useCurrentUser()
  const logout = useLogOut()

  return (
    <Flex direction="column" gap={2}>
      <Text>Hello, {currentUser?.name}!</Text>
      <Button text="Logout" onClick={logout} mode="ghost" />
    </Flex>
  )
}
