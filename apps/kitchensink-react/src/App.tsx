import {createSanityInstance, LOGGED_IN_STATES} from '@sanity/sdk'
import {LoginLinks} from '@sanity/sdk-react/components'
import {useCurrentUser, useLoggedInState} from '@sanity/sdk-react/hooks'
import {Avatar, Container, Heading, ThemeProvider} from '@sanity/ui'
import {buildTheme} from '@sanity/ui/theme'

const theme = buildTheme({})

export function App(): JSX.Element {
  const sanityInstance = createSanityInstance()
  const currentUser = useCurrentUser(sanityInstance)
  const loggedInState = useLoggedInState(sanityInstance)

  return (
    <ThemeProvider theme={theme}>
      <Container width={0}>
        <Heading as="h1" size={5} style={{marginBottom: 24}}>
          React Kitchensink
        </Heading>
        {loggedInState === LOGGED_IN_STATES.LOGGED_IN ? (
          <div style={{display: 'flex', alignItems: 'center', gap: 4}}>
            <Avatar src={currentUser?.profileImage} color="blue" />{' '}
            <span>Welcome {currentUser?.name}</span>
          </div>
        ) : (
          <LoginLinks sanityInstance={sanityInstance} />
        )}
      </Container>
    </ThemeProvider>
  )
}
