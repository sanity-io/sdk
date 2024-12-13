import {type Meta, type StoryObj} from '@storybook/react'

import {DocumentPreviewLayout} from './DocumentPreviewLayout'

const meta: Meta<typeof DocumentPreviewLayout> = {
  title: 'DocumentPreviewLayout',
  component: DocumentPreviewLayout,
}

export default meta
type Story = StoryObj<typeof meta>

export const Basic: Story = {
  args: {
    title: 'Hello World',
    url: '#',
  },
  render: (props) => {
    return <DocumentPreviewLayout {...props} />
  },
}

export const AllProps: Story = {
  args: {
    title: 'Hello World',
    subtitle: 'It’s nice to meet you',
    media: {
      type: 'image-asset',
      url: 'https://picsum.photos/80/80',
    },
    url: '#',
    docType: 'article',
    status: 'published',
  },
  render: (props) => {
    return <DocumentPreviewLayout {...props} />
  },
}
