import {studioTheme, ThemeProvider} from '@sanity/ui'
import {type Meta, type StoryObj} from '@storybook/react'

import {SDKProvider} from '../../../context/ExampleContext'
import {config} from '../../../defaultConfig/config'
import {StandalonePreview} from './StandalonePreview'

const documentId = '1cec5c50-61ba-4286-94dd-a1fed7dabb82'
const documentType = 'book'

const StorybookComponent = () => {
  return (
    <ThemeProvider scheme={'light'} theme={studioTheme}>
      <SDKProvider config={config}>
        <StandalonePreview documentId={documentId} documentType={documentType} />
      </SDKProvider>
    </ThemeProvider>
  )
}

const meta: Meta<typeof StandalonePreview> = {
  title: 'Standalone Preview',
  component: StorybookComponent,
}

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {},
}
