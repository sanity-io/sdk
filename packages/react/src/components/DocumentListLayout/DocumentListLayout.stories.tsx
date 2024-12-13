import {type Meta, type StoryObj} from '@storybook/react'

import {DocumentPreviewLayout} from '../DocumentPreviewLayout/DocumentPreviewLayout.tsx'
import {DocumentListLayout} from './DocumentListLayout.tsx'

const meta: Meta<typeof DocumentListLayout> = {
  title: 'DocumentListLayout',
  component: DocumentListLayout,
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
  },
  {
    id: '3',
    title: 'Hello World',
    subtitle: 'What a nice list I get to live in',
    url: '#',
    docType: 'image',
    status: 'published',
  },
  {
    id: '4',
    title: 'I’ve been selected',
    subtitle: 'I feel special',
    selected: true,
    url: '#',
    docType: 'video',
    status: 'draft',
  },
  {
    id: '5',
    title: 'A very long title that at some point might get truncated if it goes for long enough',
    subtitle:
      'Along with a subtitle that is quite long as well, in order to demonstrate the truncation of its text',
    url: '#',
    docType: 'audio',
    status: 'published',
  },
  {
    id: '6',
    title: 'Hello World',
    subtitle: 'What a nice list I get to live in',
    url: '#',
    docType: 'pdf',
    status: 'published',
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
  },
]

export const Default: Story = {
  render: () => {
    return (
      <DocumentListLayout>
        {mockDocs.map((doc) => (
          <li key={doc.id}>
            <DocumentPreviewLayout
              title={doc.title}
              subtitle={doc.subtitle}
              selected={doc.selected}
              docType={doc.docType}
              status={doc.status}
              url={doc.url}
            />
          </li>
        ))}
      </DocumentListLayout>
    )
  },
}
