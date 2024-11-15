import {type Meta, type StoryObj} from '@storybook/react'

import DocumentListUI from './DocumentListUI'

const meta: Meta<typeof DocumentListUI> = {
  title: 'DocumentListUI',
  component: DocumentListUI,
}

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    documents: [
      {title: 'Just a title', url: '#'},
      {title: 'A title, but also…', subtitle: 'A subtitle', url: '#'},
      {title: 'Hello World', subtitle: 'What a nice list I get to live in', url: '#'},
      {title: 'Just a title', url: '#'},
      {
        title:
          'A very long title that at some point might get truncated if it goes for long enough',
        subtitle:
          'Along with a subtitle that is quite long as well, in order to demonstrate the truncation of its text',
        url: '#',
      },
      {title: 'Hello World', subtitle: 'What a nice list I get to live in', url: '#'},
      {title: 'Just a title', url: '#'},
      {title: 'A title, but also…', subtitle: 'A subtitle', url: '#'},
      {title: 'Hello World', subtitle: 'What a nice list I get to live in', url: '#'},
    ],
    layout: 'list',
  },
  render: (props) => {
    return <DocumentListUI {...props} />
  },
}
