import {Card, studioTheme, ThemeProvider} from '@sanity/ui'
import {DecoratorHelpers} from '@storybook/addon-themes'
import {StoryContext, StoryFn} from '@storybook/react'
import React from 'react'

const {initializeThemeState, pluckThemeFromContext, useThemeParameters} = DecoratorHelpers

/**
 * Story decorator which wraps all stories in a Sanity <ThemeProvider> and passes the current theme
 * value defined in Story.
 */

export const withSanityTheme = ({
  themes,
  defaultTheme,
}: {
  themes: Record<string, string>
  defaultTheme: string
}) => {
  initializeThemeState(Object.keys(themes), defaultTheme)

  return (Story: StoryFn, context: StoryContext): JSX.Element => {
    const selectedTheme = pluckThemeFromContext(context)
    const {themeOverride} = useThemeParameters()

    const selected =
      themeOverride === 'dark' || selectedTheme === 'dark' || defaultTheme === 'dark'
        ? 'dark'
        : 'light'

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
