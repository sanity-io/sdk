<p align="center">
  <a href="https://sanity.io">
    <img src="https://cdn.sanity.io/images/3do82whm/next/1dfce9dde7a62ccaa8e8377254a1e919f6c07ad3-128x128.svg" />
  </a>
  <h1 align="center">Sanity SDK - React</h1>
</p>

React components and hooks for creating Sanity applications.

## Installation

```bash
npm i @sanity/sdk-react @sanity/sdk
```

## SDK Documentation

See the [SDK Documentation](https://sdk-docs.sanity.dev) for more information.

## Quick Start

Here's how to implement your Sanity application:

```tsx
import {createSanityInstance} from '@sanity/sdk'
import {AuthBoundary, SanityProvider} from '@sanity/sdk-react/components'
import {useCurrentUser, useLogOut} from '@sanity/sdk-react/hooks'
import {Button, Flex, Spinner, Text, ThemeProvider} from '@sanity/ui'
import {buildTheme} from '@sanity/ui/theme'
import {Suspense} from 'react'

const theme = buildTheme({})
const sanityInstance = createSanityInstance({
  projectId: '<your-project-id>',
  dataset: '<your-dataset>',
  // optional auth config set projectId and dataset to '' and authScope to 'org' for a global token
  // auth: {
  //   authScope: 'project',
  //   ...
  // },
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
```

## Customizing your application

If you would like to implement a custom look and feel, you can use the hooks in your own components.

## Available Hooks

- `useAuthState` - Get current authentication state
- `useCurrentUser` - Access the currently authenticated user
- `useAuthToken` - Access the authentication token
- `useLoginUrls` - Get OAuth login URLs
- `useLogOut` - Handle user logout
- `useSanityInstance` - Access the Sanity client instance
- and more...

## TypeScript Support

This package includes TypeScript definitions. You can import types like:

```tsx
import type {
  SanityProviderProps,
  AuthBoundaryProps,
  LoginLayoutProps,
  LoginErrorProps,
} from '@sanity/react'
```

## License

MIT © Sanity.io
