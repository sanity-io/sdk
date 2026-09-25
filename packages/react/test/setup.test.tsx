import {type SanityInstance} from '@sanity/sdk'
import {render} from '@testing-library/react'
import {use} from 'react'
import {describe, expect, it} from 'vitest'

import {ResourceProvider} from '../src/context/ResourceProvider'
import {SanityInstanceContext} from '../src/context/SanityInstanceContext'

// These tests depend on running in order: the second checks what the first left behind.
describe('test setup', () => {
  let instanceFromPreviousTest: SanityInstance | null = null

  it('renders a ResourceProvider that creates an instance', () => {
    const CaptureInstance = () => {
      instanceFromPreviousTest = use(SanityInstanceContext)
      return null
    }
    render(
      <ResourceProvider projectId="test" dataset="test" fallback={null}>
        <CaptureInstance />
      </ResourceProvider>,
    )

    expect(instanceFromPreviousTest).not.toBeNull()
  })

  it('disposes instances rendered by the previous test', () => {
    expect(instanceFromPreviousTest?.isDisposed()).toBe(true)
  })
})
