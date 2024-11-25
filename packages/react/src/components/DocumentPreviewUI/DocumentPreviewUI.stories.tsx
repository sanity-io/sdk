import {type Meta, type StoryObj} from '@storybook/react'

import DocumentPreviewUI from './DocumentPreviewUI'

const meta: Meta<typeof DocumentPreviewUI> = {
  title: 'DocumentPreviewUI',
  component: DocumentPreviewUI,
}

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    docType: 'article',
    title: 'Hello World',
    subtitle: 'It’s nice to meet you',
    url: '#',
  },
  render: (props) => {
    return <DocumentPreviewUI {...props} />
  },
}
