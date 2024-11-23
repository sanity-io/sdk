import {createSanityInstance, testFunction} from '@sanity/sdk'
import {LoginLinks} from '@sanity/sdk-react/components'
import {ThemeProvider} from '@sanity/ui'
import {buildTheme} from '@sanity/ui/theme'

const theme = buildTheme({})

export function App(): JSX.Element {
  const sanityInstance = createSanityInstance()

  return (
    <ThemeProvider theme={theme}>
      <div>
        <h1>React Kitchensink</h1>
        <h2>Test Function</h2>
        <p>Test Function Output: {testFunction()}</p>
        <LoginLinks sanityInstance={sanityInstance} />
      </div>
    </ThemeProvider>
  )
}
