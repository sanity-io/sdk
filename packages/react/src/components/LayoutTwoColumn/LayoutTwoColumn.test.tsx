import {render, screen} from '../../../test/test-utils'
import {LayoutTwoColumn} from './LayoutTwoColumn'

describe('LayoutTwoColumn', () => {
  it('renders both columns with provided content', () => {
    render(<LayoutTwoColumn first={<div>First Content</div>} second={<div>Second Content</div>} />)

    expect(screen.getByText('First Content')).toBeInTheDocument()
    expect(screen.getByText('Second Content')).toBeInTheDocument()
  })

  it('applies correct data-ui attributes', () => {
    const {container} = render(
      <LayoutTwoColumn first={<div>First Content</div>} second={<div>Second Content</div>} />,
    )

    expect(container.querySelector('[data-ui="LayoutTwoColumn"]')).toBeInTheDocument()
    expect(container.querySelector('[data-ui="LayoutTwoColumn:First"]')).toBeInTheDocument()
    expect(container.querySelector('[data-ui="LayoutTwoColumn:Second"]')).toBeInTheDocument()
  })
})
