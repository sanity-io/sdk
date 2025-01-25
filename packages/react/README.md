<p align="center">
  <a href="https://sanity.io">
    <img src="https://cdn.sanity.io/images/3do82whm/next/1dfce9dde7a62ccaa8e8377254a1e919f6c07ad3-128x128.svg" />
  </a>
  <h1 align="center">Sanity SDK - React</h1>
</p>

React hooks for creating Sanity applications.

## Installation

```bash
npm i @sanity/sdk-react @sanity/sdk
```

## SDK Documentation

See the [SDK Documentation](https://sdk-docs.sanity.dev) for more information.

## Quick Start

Here's how to implement your Sanity application:

```bash
# Create a new Vite React TypeScript project
npm create vite@latest my-content-os-app -- --template react-ts -y
cd my-content-os-app
# Install Sanity dependencies
npm i @sanity/sdk-react @sanity/sdk
# Run the app
npm run dev
# In another terminal, run the Sanity CoreUI
npx @sanity/os-cli run --url=http://localhost:5173/
```

```tsx
// src/App.tsx
import {SanityConfig} from '@sanity/sdk'
import {SanityApp} from '@sanity/sdk-react/components'
import {useCurrentUser, useLogOut} from '@sanity/sdk-react/hooks'

import './App.css'

const sanityConfig: SanityConfig = {
  projectId: '<your-project-id>',
  dataset: '<your-dataset>',
  // optional auth config set projectId and dataset to '' and authScope to 'org' for a global token
  // auth: {
  //   authScope: "org",
  // },
}

export function App(): JSX.Element {
  return (
    <SanityApp sanityConfig={sanityConfig}>
      <MyApp />
    </SanityApp>
  )
}

function MyApp() {
  const currentUser = useCurrentUser()
  const logout = useLogOut()

  return (
    <div>
      <h1>Hello, {currentUser?.name}!</h1>
      <button onClick={logout}>Logout</button>
    </div>
  )
}

export default App
```

```css
/* src/App.css */
#root {
  margin: auto;
}

.sc-login-layout {
  min-height: 100vh;
  display: flex;
  background: #f3f3f3;
}

.sc-login-layout__container {
  margin: auto;
  padding: 2rem;
}

.sc-login-layout__card {
  background: white;
  padding: 2rem;
}

.sc-login__title,
.sc-login-callback {
  text-align: center;
  margin-bottom: 2rem;
  color: #333;
}

.sc-login-providers {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.sc-login-providers a {
  padding: 0.8rem;
  border: 1px solid #ddd;
  text-decoration: none;
  color: #333;
  text-align: center;
}

.sc-login-footer {
  margin-top: 2rem;
  text-align: center;
}

.sc-login-footer__links {
  list-style: none;
  padding: 0;
  display: flex;
  justify-content: center;
  gap: 1.5rem;
}

.sc-login-footer__link a {
  font-size: 0.9rem;
}
```

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
