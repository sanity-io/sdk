import {render} from '@testing-library/react'
import {describe, it} from 'vitest'

import ExampleComponent from './ExampleComponent'

describe('ExampleComponent', () => {
  it('renders correctly', () => {
    render(<ExampleComponent />)
  })
})
