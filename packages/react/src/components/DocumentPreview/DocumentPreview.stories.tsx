import {type Meta, type StoryObj} from '@storybook/react'

import DocumentPreview from './DocumentPreview'

const meta: Meta<typeof DocumentPreview> = {
  title: 'DocumentPreview',
  component: DocumentPreview,
}

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    title: 'Hello World',
    subtitle: 'It’s nice to meet you',
    url: '#',
  },
  render: (props) => {
    return <DocumentPreview {...props} />
  },
}
