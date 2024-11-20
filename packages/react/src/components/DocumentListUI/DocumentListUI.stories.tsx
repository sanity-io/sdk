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
      {id: '1', title: 'Just a title', url: '#', docType: 'article'},
      {id: '2', title: 'A title, but also', subtitle: 'A subtitle', url: '#', docType: 'article'},
      {
        id: '3',
        title: 'Hello World',
        subtitle: 'What a nice list I get to live in',
        url: '#',
        docType: 'image',
      },
      {
        id: '4',
        title: 'I’ve been selected',
        subtitle: 'I feel special',
        selected: true,
        url: '#',
        docType: 'video',
      },
      {
        id: '5',
        title:
          'A very long title that at some point might get truncated if it goes for long enough',
        subtitle:
          'Along with a subtitle that is quite long as well, in order to demonstrate the truncation of its text',
        url: '#',
        docType: 'audio',
      },
      {
        id: '6',
        title: 'Hello World',
        subtitle: 'What a nice list I get to live in',
        url: '#',
        docType: 'pdf',
      },
      {id: '7', title: 'Just a title', url: '#', docType: 'note'},
      {id: '8', title: 'A title, but also', subtitle: 'A subtitle', url: '#', docType: 'document'},
      {
        id: '9',
        title: 'Hello World',
        subtitle: 'What a nice list I get to live in',
        url: '#',
        docType: 'biography',
      },
    ],
    layout: 'list',
  },
  render: (props) => {
    return <DocumentListUI {...props} />
  },
}
