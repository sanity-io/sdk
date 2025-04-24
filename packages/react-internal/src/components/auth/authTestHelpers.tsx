import {ResourceProvider} from '@sanity/sdk-react'
import {ThemeProvider} from '@sanity/ui'
import {buildTheme} from '@sanity/ui/theme'
// eslint-disable-next-line import/no-extraneous-dependencies
import {render, type RenderResult} from '@testing-library/react'
import React from 'react'

const theme = buildTheme()

export const renderWithWrappers = (ui: React.ReactElement): RenderResult => {
  return render(
    <ResourceProvider projectId="test-project-id" dataset="production" fallback={null}>
      <ThemeProvider theme={theme}>{ui}</ThemeProvider>
    </ResourceProvider>,
  )
}
