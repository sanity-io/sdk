import '@testing-library/jest-dom/vitest'

import {type SanityInstance} from '@sanity/sdk'
import {cleanup} from '@testing-library/react'
import {afterEach, vi} from 'vitest'

const renderedInstances = new Set<SanityInstance>()

// ResourceProvider never disposes its instance, so without this every test in a file would share
// the stores left behind by the tests before it.
vi.mock('../src/context/SanityInstanceProvider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/context/SanityInstanceProvider')>()
  return {
    ...actual,
    SanityInstanceProvider: (props: Parameters<typeof actual.SanityInstanceProvider>[0]) => {
      renderedInstances.add(props.instance)
      return actual.SanityInstanceProvider(props)
    },
  }
})

// Automatically cleanup after each test
afterEach(() => {
  cleanup()
  renderedInstances.forEach((instance) => instance.dispose())
  renderedInstances.clear()
})
