import {describe, expect, it} from 'vitest'

import {render, screen} from '../../../test/test-utils.tsx'
import {DocumentGridLayout} from './DocumentGridLayout.tsx'

describe('DocumentGridLayout', () => {
  const mockDocuments = [
    {
      id: '1',
      title: 'Test Document 1',
      subtitle: 'Subtitle 1',
      docType: 'post',
      status: 'published',
      url: '/doc/1',
    },
    {
      id: '2',
      title: 'Test Document 2',
      subtitle: 'Subtitle 2',
      docType: 'page',
      status: 'draft',
      url: '/doc/2',
    },
  ]

  it('renders the expected content', () => {
    render(
      <DocumentGridLayout>
        {mockDocuments.map((doc) => (
          <li key={doc.id}>{doc.title}</li>
        ))}
      </DocumentGridLayout>,
    )
    const list = screen.getByRole('list')
    expect(list.tagName).toBe('OL')
    expect(list.dataset['ui']).toBe('DocumentGridLayout')

    const items = screen.getAllByRole('listitem')
    expect(items[0]).toContainHTML('Test Document 1')
    expect(items[1]).toContainHTML('Test Document 2')
  })
})
