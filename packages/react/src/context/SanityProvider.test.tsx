import {createSanityInstance} from '@sanity/sdk'
import {render} from '@testing-library/react'
import {describe, expect, it} from 'vitest'

import {useSanityInstance} from '../hooks/context/useSanityInstance'
import {SanityProvider} from './SanityProvider'

describe('SanityProvider', () => {
  const sanityInstance = createSanityInstance({
    resources: [{projectId: 'test-project', dataset: 'production'}],
  })

  it('provides instance to nested components', () => {
    const TestComponent = () => {
      const instance = useSanityInstance()
      return <div data-testid="test">{instance.resources[0].projectId}</div> // TODO: support multiple resources
    }

    const {getByTestId} = render(
      <SanityProvider sanityInstance={sanityInstance}>
        <TestComponent />
      </SanityProvider>,
    )

    expect(getByTestId('test')).toHaveTextContent('test-project')
  })
})
