import {describe, expect, it} from 'vitest'

import {render, screen} from '../../../test/test-utils.tsx'
import DocumentListUI from './DocumentListUI'

describe('DocumentListUI', () => {
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

  it('renders nothing when documents array is empty', () => {
    const {container} = render(<DocumentListUI documents={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders list layout by default', () => {
    render(<DocumentListUI documents={mockDocuments} />)
    const list = screen.getByRole('list')
    expect(list.tagName).toBe('OL')
    expect(list.dataset['ui']).toBe('DocumentList:List')
  })

  it('renders grid layout when specified', () => {
    render(<DocumentListUI documents={mockDocuments} layout="grid" />)
    const grid = screen.getByRole('list')
    expect(grid.tagName).toBe('OL')
    expect(grid.dataset['ui']).toBe('DocumentList:Grid')
  })

  it('renders correct number of document previews', () => {
    render(<DocumentListUI documents={mockDocuments} />)
    const listItems = screen.getAllByRole('listitem')
    expect(listItems).toHaveLength(2)
  })

  it('passes correct props to DocumentPreviewUI components', () => {
    render(<DocumentListUI documents={mockDocuments} />)

    // Check if titles are rendered
    expect(screen.getByText('Test Document 1')).toBeInTheDocument()
    expect(screen.getByText('Test Document 2')).toBeInTheDocument()

    // Check if subtitles are rendered
    expect(screen.getByText('Subtitle 1')).toBeInTheDocument()
    expect(screen.getByText('Subtitle 2')).toBeInTheDocument()
  })
})
