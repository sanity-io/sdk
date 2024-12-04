import {Box} from '@sanity/ui'
import {type Meta, type StoryObj} from '@storybook/react'

import {LayoutTwoColumn} from './LayoutTwoColumn'

const meta: Meta<typeof LayoutTwoColumn> = {
  title: 'LayoutTwoColumn',
  component: LayoutTwoColumn,
}

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    first: (
      <Box padding={4} style={{background: '#eee'}}>
        Left Column Content
      </Box>
    ),
    second: (
      <Box padding={4} style={{background: '#ddd'}}>
        Right Column Content
      </Box>
    ),
  },
}
