import {render, screen} from '../../../test/test-utils.tsx'
import {DocumentPreviewLayout} from './DocumentPreviewLayout'

describe('DocumentPreviewLayout', () => {
  it('renders the data it receives via props', () => {
    render(<DocumentPreviewLayout title="Test Preview" subtitle="It works" />)
    expect(screen.getByText('Test Preview')).toBeVisible()
    expect(screen.getByText('It works')).toBeVisible()
  })

  it('renders empty when no title is provided (todo)', () => {
    const {container} = render(<DocumentPreviewLayout title="" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the doctype when one is provided', () => {
    render(<DocumentPreviewLayout title="Test Preview" docType="article" />)
    expect(screen.getByText('article')).toBeVisible()
  })

  it('renders the published status when provided', () => {
    render(<DocumentPreviewLayout title="Test Preview" status="published" />)
    expect(screen.getByText('published')).toBeVisible()
  })

  it('renders the draft status when provided', () => {
    render(<DocumentPreviewLayout title="Test Preview" status="draft" />)
    expect(screen.getByText('draft')).toBeVisible()
  })
})
