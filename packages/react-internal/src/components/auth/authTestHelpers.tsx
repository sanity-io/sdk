import {createSanityInstance} from '@sanity/sdk'
import {SanityProvider} from '@sanity/sdk-react/context'
import {ThemeProvider} from '@sanity/ui'
import {buildTheme} from '@sanity/ui/theme'
import {render, type RenderResult} from '@testing-library/react'
import React from 'react'

const sanityInstance = createSanityInstance({projectId: 'test-project-id', dataset: 'production'})
const theme = buildTheme()

export const renderWithWrappers = (ui: React.ReactElement): RenderResult => {
  return render(
    <SanityProvider sanityInstance={sanityInstance}>
      <ThemeProvider theme={theme}>{ui}</ThemeProvider>
    </SanityProvider>,
  )
}
