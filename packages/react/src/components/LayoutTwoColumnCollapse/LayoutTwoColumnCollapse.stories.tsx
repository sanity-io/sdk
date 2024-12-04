import {Box} from '@sanity/ui'
import {type Meta, type StoryObj} from '@storybook/react'

import {LayoutTwoColumnCollapse} from './LayoutTwoColumnCollapse'

const meta: Meta<typeof LayoutTwoColumnCollapse> = {
  title: 'LayoutTwoColumnCollapse',
  component: LayoutTwoColumnCollapse,
}

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    first: (
      <Box padding={4} style={{background: '#eee'}}>
        First Column Content
      </Box>
    ),
    second: (
      <Box padding={4} style={{background: '#ddd'}}>
        Second Column Content
      </Box>
    ),
  },
}
