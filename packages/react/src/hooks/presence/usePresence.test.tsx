import {getPresence} from '@sanity/sdk'
import {NEVER} from 'rxjs'
import {describe, expect, it, vi} from 'vitest'

vi.mock('@sanity/sdk', () => ({
  getPresence: vi.fn(),
}))

vi.mock('../context/useSanityInstance', () => ({
  useSanityInstance: vi.fn(() => ({config: {projectId: 'test', dataset: 'test'}})),
}))

describe('usePresence', () => {
  it('imports and exports the hook correctly', async () => {
    const mockPresenceSource = {
      getCurrent: vi.fn(() => []),
      subscribe: vi.fn(() => vi.fn()),
      observable: NEVER,
    }

    vi.mocked(getPresence).mockReturnValue(mockPresenceSource)

    const {usePresence} = await import('./usePresence')

    expect(usePresence).toBeDefined()
    expect(typeof usePresence).toBe('function')
  })
})
