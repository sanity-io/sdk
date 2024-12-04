import {render, screen} from '../../../test/test-utils'
import {LayoutTwoColumnCollapse} from './LayoutTwoColumnCollapse'

describe('LayoutTwoColumnCollapse', () => {
  it('renders both columns with provided content', () => {
    render(
      <LayoutTwoColumnCollapse
        first={<div>First Content</div>}
        second={<div>Second Content</div>}
      />,
    )

    expect(screen.getByText('First Content')).toBeInTheDocument()
    expect(screen.getByText('Second Content')).toBeInTheDocument()
  })

  it('applies correct data-ui attributes', () => {
    const {container} = render(
      <LayoutTwoColumnCollapse
        first={<div>First Content</div>}
        second={<div>Second Content</div>}
      />,
    )

    expect(container.querySelector('[data-ui="LayoutTwoColumnCollapse"]')).toBeInTheDocument()
    expect(container.querySelector('[data-ui="LayoutTwoColumnCollapse:First"]')).toBeInTheDocument()
    expect(
      container.querySelector('[data-ui="LayoutTwoColumnCollapse:Second"]'),
    ).toBeInTheDocument()
  })
})
