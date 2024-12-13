import {type Meta, type StoryObj} from '@storybook/react'

import {DocumentPreviewLayout} from '../DocumentPreviewLayout/DocumentPreviewLayout.tsx'
import {DocumentGridLayout} from './DocumentGridLayout.tsx'

const meta: Meta<typeof DocumentGridLayout> = {
  title: 'DocumentGridLayout',
  component: DocumentGridLayout,
}

export default meta
type Story = StoryObj<typeof meta>

const mockDocs = [
  {id: '1', title: 'Just a title', url: '#', docType: 'article', status: 'published'},
  {
    id: '2',
    title: 'A title, but also',
    subtitle: 'A subtitle',
    url: '#',
    docType: 'article',
    status: 'draft',
    media: {
      type: 'image-asset',
      url: 'https://picsum.photos/75/75',
    },
  },
  {
    id: '3',
    title: 'Hello World',
    subtitle: 'What a nice list I get to live in',
    url: '#',
    docType: 'image',
    status: 'published',
    media: {
      type: 'image-asset',
      url: 'https://picsum.photos/80/80',
    },
  },
  {
    id: '4',
    title: 'I’ve been selected',
    subtitle: 'I feel special',
    selected: true,
    url: '#',
    docType: 'video',
    status: 'draft',
    media: {
      type: 'image-asset',
      url: 'https://picsum.photos/100/100',
    },
  },
  {
    id: '5',
    title: 'A very long title that at some point might get truncated if it goes for long enough',
    subtitle:
      'Along with a subtitle that is quite long as well, in order to demonstrate the truncation of its text',
    url: '#',
    docType: 'audio',
    status: 'published',
    media: {
      type: 'image-asset',
      url: 'https://picsum.photos/75/75',
    },
  },
  {
    id: '6',
    title: 'Hello World',
    subtitle: 'What a nice list I get to live in',
    url: '#',
    docType: 'pdf',
    status: 'published',
    media: {
      type: 'image-asset',
      url: 'https://picsum.photos/75/75',
    },
  },
  {id: '7', title: 'Just a title', url: '#', docType: 'note', status: 'published,'},
  {
    id: '8',
    title: 'A title, but also',
    subtitle: 'A subtitle',
    url: '#',
    docType: 'document',
    status: 'draft',
  },
  {
    id: '9',
    title: 'Hello World',
    subtitle: 'What a nice list I get to live in',
    url: '#',
    docType: 'biography',
    status: 'published',
    media: {
      type: 'image-asset',
      url: 'https://picsum.photos/200/200',
    },
  },
]

export const Default: Story = {
  render: () => {
    return (
      <DocumentGridLayout>
        {mockDocs.map((doc) => (
          <li key={doc.id}>
            <DocumentPreviewLayout
              title={doc.title}
              subtitle={doc.subtitle}
              media={doc.media}
              selected={doc.selected}
              docType={doc.docType}
              status={doc.status}
              url={doc.url}
            />
          </li>
        ))}
      </DocumentGridLayout>
    )
  },
}
