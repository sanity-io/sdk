import {DecoratorHelpers} from '@storybook/addon-themes'
import {StoryFn} from '@storybook/react'
import React from 'react'
import {ThemeProvider, Card, studioTheme} from '@sanity/ui'

const {initializeThemeState, pluckThemeFromContext, useThemeParameters} = DecoratorHelpers

/**
 * Story decorator which wraps all stories in a Sanity <ThemeProvider> and passes the current theme
 * value defined in Story.
 */

export const withSanityTheme = ({themes, defaultTheme}) => {
  initializeThemeState(Object.keys(themes), defaultTheme)

  return (Story: StoryFn, context) => {
    const selectedTheme = pluckThemeFromContext(context)
    const {themeOverride} = useThemeParameters()

    const selected = themeOverride || selectedTheme || defaultTheme

    return (
      <ThemeProvider scheme={selected} theme={studioTheme}>
        {/* Todo: why is Card required for Text.muted to work? */}
        <Card>
          <Story />
        </Card>
      </ThemeProvider>
    )
  }
}
