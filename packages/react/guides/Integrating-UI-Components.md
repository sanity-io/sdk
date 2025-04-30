---
title: Integrating UI Components
---

# Integrating UI Components

The Sanity App SDK gives you complete freedom to craft your application’s design. Whether your preferred styling solution is Sanity UI, Tailwind, vanilla CSS, or something else entirely, the SDK‘s headless approach allows you to style your app with the tools your team knows best, while benefiting from powerful React hooks that unlock Sanity platform capabilities.

## Example: Sanity UI

First, begin by installing Sanity UI:

```shell
npm install @sanity/ui styled-components
```

Then, in your custom application’s `src/App.tsx`, instantiate Sanity UI’s ThemeProvider as usual (within the `SanityApp` component):

```tsx
// App.tsx
import {type SanityConfig} from '@sanity/sdk'
import {SanityApp} from '@sanity/sdk-react'

// Sanity UI
import {ThemeProvider} from '@sanity/ui'
import {buildTheme} from '@sanity/ui/theme'

import {ExampleComponent} from './ExampleComponent'
import './App.css'

// Build the Sanity UI theme
const theme = buildTheme()

export function App() {
  // apps can access many different projects or other sources of data
  const sanityConfigs: SanityConfig[] = [
    {
      projectId: 'project-id',
      dataset: 'dataset-name',
    },
  ]

  return (
    <div className="app-container">
      <SanityApp config={sanityConfigs} fallback={<div>Loading...</div>}>
        <ThemeProvider theme={theme}>
          {/* add your own components here! */}
          <ExampleComponent />
        </ThemeProvider>
      </SanityApp>
    </div>
  )
}

export default App
```

You can now use Sanity UI as expected within your custom application.
