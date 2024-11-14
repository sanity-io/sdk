import {ThemeProvider} from '@sanity/ui'
import {buildTheme} from '@sanity/ui/theme'
import {render, type RenderOptions, type RenderResult} from '@testing-library/react'
import React, {type ReactElement} from 'react'

const AllTheProviders = ({children}: {children: React.ReactNode}) => {
  const theme = buildTheme()
  return <ThemeProvider theme={theme}>{children}</ThemeProvider>
}

const customRender = (ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>): RenderResult =>
  render(ui, {wrapper: AllTheProviders, ...options})

export * from '@testing-library/react'
export {customRender as render}
