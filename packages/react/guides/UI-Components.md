---
title: Integrating UI Components
---

# Integrating UI Components

The Sanity App SDK gives you complete freedom to craft your application’s design. The SDK empowers you to create exactly the user experience you envision — using your preferred styling solutions or component libraries — all while benefiting from the powerful hooks and functionality of the Sanity platform.

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
import {ThemeProvider, studioTheme} from '@sanity/ui'

import {ExampleComponent} from './ExampleComponent'
import './App.css'

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
      <SanityApp sanityConfigs={sanityConfigs} fallback={<div>Loading...</div>}>
        <ThemeProvider theme={studioTheme}>
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
