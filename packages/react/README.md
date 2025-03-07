<p align="center">
  <a href="https://sanity.io">
    <img src="https://cdn.sanity.io/images/3do82whm/next/1dfce9dde7a62ccaa8e8377254a1e919f6c07ad3-128x128.svg" />
  </a>
  <h1 align="center">Sanity SDK - React</h1>
</p>

React hooks for creating Sanity applications.

## 💻 Installation

```bash
npm i @sanity/sdk-react @sanity/sdk
```

> 💡 Looking to build a Sanity application? Check out the [Quick Start](#quick-start) section.

## 📚 SDK Documentation

See the [SDK Documentation](https://sdk-docs.sanity.dev) for more information.

## 🚀 Quick Start

Here's how to implement your Sanity application:

1. Create a new React TypeScript project using the Sanity template

```bash
pnpx sanity@latest init --template core-app
cd my-content-os-app
```

2. Install dependencies

```bash
npm i
```

3. Run the app

```bash
npm run dev
```

4. Open the App in Sanity Dashboard with your organization ID

```
https://core.sanity.io/<your-organization-id>?dev=localhost:5173
```

5. Overwrite the `src/App.tsx` file with the following code:

```tsx
// src/App.tsx
import {SanityConfig} from '@sanity/sdk'
import {SanityApp} from '@sanity/sdk-react/components'
import {useCurrentUser, useLogOut} from '@sanity/sdk-react/hooks'

import './App.css'

const sanityConfig: SanityConfigs = [
  {
    projectId: '<your-project-id>',
    dataset: '<your-dataset>',
  },
]

export function App(): JSX.Element {
  return (
    <SanityApp sanityConfigs={sanityConfigs}>
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

6. Overwrite the `src/App.css` file with the following code:

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

## License

MIT © Sanity.io
