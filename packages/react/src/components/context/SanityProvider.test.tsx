import {createSanityInstance} from '@sanity/sdk'
import {render} from '@testing-library/react'
import React from 'react'
import {describe, expect, it, vi} from 'vitest'

import {useSanityInstance} from '../../hooks/context/useSanityInstance'
import {SanityProvider} from './SanityProvider'

vi.mock('@sanity/sdk', () => ({
  createSanityInstance: vi.fn(() => ({
    identity: {
      projectId: 'test-project',
    },
  })),
}))

describe('SanityProvider', () => {
  const config = {projectId: 'test-project', dataset: 'production'}

  it('provides instance to nested components', () => {
    const TestComponent = () => {
      const instance = useSanityInstance()
      return <div data-testid="test">{JSON.stringify(instance)}</div>
    }

    const {getByTestId} = render(
      <SanityProvider config={config}>
        <TestComponent />
      </SanityProvider>,
    )

    expect(getByTestId('test')).toHaveTextContent('{"projectId":"test-project"')
    expect(createSanityInstance).toHaveBeenCalledWith(config)
  })

  it('creates new instance with updated config', () => {
    const newConfig = {projectId: 'new-project', dataset: 'staging'}

    const {rerender} = render(
      <SanityProvider config={config}>
        <div />
      </SanityProvider>,
    )

    rerender(
      <SanityProvider config={newConfig}>
        <div />
      </SanityProvider>,
    )

    expect(createSanityInstance).toHaveBeenCalledWith(newConfig)
  })
})
