import {render, type RenderOptions} from '@testing-library/react'
import {type ReactElement} from 'react'

// Re-export everything from React Testing Library
export * from '@testing-library/react'

// Custom render function that can be extended later
const customRender = (
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>,
): ReturnType<typeof render> =>
  render(ui, {
    // Add any default providers here if needed
    // wrapper: AllTheProviders,
    ...options,
  })

export {customRender as render}
