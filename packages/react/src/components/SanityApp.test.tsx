import {AuthStateType, type SanityConfig} from '@sanity/sdk'
import {render, screen} from '@testing-library/react'
import {describe, expect, it} from 'vitest'

import {SanityApp} from './SanityApp'

vi.mock('@sanity/sdk', async () => {
  const actual = await vi.importActual('@sanity/sdk')
  return {
    ...actual,
    createSanityInstance: vi.fn(() => ({
      config: {},
      auth: {
        getSession: vi.fn(),
        signIn: vi.fn(),
        signOut: vi.fn(),
      },
      resources: [
        {
          projectId: 'test-project',
          dataset: 'test-dataset',
        },
      ],
      dispose: vi.fn(),
    })),
  }
})

vi.mock('../hooks/auth/useAuthState', () => ({
  useAuthState: () => ({
    type: AuthStateType.LOGGED_IN,
    session: {
      user: {
        id: 'test-user',
      },
    },
  }),
}))

describe('SanityApp', () => {
  const mockSanityConfig: SanityConfig = {
    resources: [{projectId: 'test-project', dataset: 'test-dataset'}],
  }

  it('renders children correctly', async () => {
    const testMessage = 'Test Child Component'
    render(
      <SanityApp sanityConfig={mockSanityConfig}>
        <div>{testMessage}</div>
      </SanityApp>,
    )

    expect(await screen.findByText(testMessage)).toBeInTheDocument()
  })
})
