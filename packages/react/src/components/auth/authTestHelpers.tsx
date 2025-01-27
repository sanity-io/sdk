import {createSanityInstance} from '@sanity/sdk'
import {ThemeProvider} from '@sanity/ui'
import {buildTheme} from '@sanity/ui/theme'
import {render, type RenderResult} from '@testing-library/react'
import React from 'react'

import {SanityProvider} from '../../context/SanityProvider'

const sanityInstance = createSanityInstance({projectId: 'test-project-id', dataset: 'production'})
const theme = buildTheme()

export const renderWithWrappers = (ui: React.ReactElement): RenderResult => {
  return render(
    <SanityProvider sanityInstance={sanityInstance}>
      <ThemeProvider theme={theme}>{ui}</ThemeProvider>
    </SanityProvider>,
  )
}
