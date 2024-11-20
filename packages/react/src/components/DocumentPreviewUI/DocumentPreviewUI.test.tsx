import {render, screen} from '../../../test/test-utils.tsx'
import DocumentPreviewUI from './DocumentPreviewUI'

describe('DocumentPreviewUI', () => {
  it('renders the data it receives via props', () => {
    render(<DocumentPreviewUI title="Test Preview" subtitle="It works" />)
    expect(screen.getByText('Test Preview')).toBeVisible()
    expect(screen.getByText('It works')).toBeVisible()
  })

  it('renders empty when no title is provided (todo)', () => {
    const {container} = render(<DocumentPreviewUI title="" />)
    expect(container).toBeEmptyDOMElement()
  })
})
