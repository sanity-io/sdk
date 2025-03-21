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
pnpx sanity@latest init --template app-quickstart
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
https://core.sanity.io/<your-organization-id>?dev=http://localhost:3333
```

5. Update the `src/App.tsx` file with your Sanity project and dataset

```tsx
// src/App.tsx
import {createSanityInstance} from '@sanity/sdk'
...

const sanityConfig: SanityConfigs = [
  {
    projectId: 'abc123',
    dataset: 'production',
  },
]

...
```

## License

MIT © Sanity.io
