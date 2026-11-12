import {createSanityInstance} from '@sanity/sdk'
import {defineFetcher} from '@sanity/sdk/_internal'
import {fireEvent, render, screen} from '@testing-library/react'
import {Suspense} from 'react'
import {ErrorBoundary} from 'react-error-boundary'
import {of, throwError} from 'rxjs'
import {expect, it, vi} from 'vitest'

import {useSanityInstance} from '../context/useSanityInstance'
import {createFetcherHook} from './createFetcherHook'
import {useResetFetchErrors} from './useResetFetchErrors'

vi.mock('../context/useSanityInstance', () => ({
  useSanityInstance: vi.fn(),
}))

it('fetches again when an error boundary resets after a failed fetch', async () => {
  vi.mocked(useSanityInstance).mockReturnValue(createSanityInstance({projectId: 'p', dataset: 'd'}))
  const fetchSpy = vi
    .fn()
    .mockReturnValueOnce(throwError(() => new Error('offline')))
    .mockReturnValueOnce(throwError(() => new Error('still offline')))
    .mockReturnValueOnce(of('back'))
  const useThing = createFetcherHook(
    defineFetcher<[], string>({
      name: 'reset-fetch-errors',
      getKey: () => 'k',
      fetch: () => fetchSpy,
    }),
  )
  const Thing = () => <p>{useThing().data}</p>
  const Boundary = () => (
    <ErrorBoundary
      onReset={useResetFetchErrors()}
      fallbackRender={({error, resetErrorBoundary}) => (
        <button onClick={resetErrorBoundary}>{(error as Error).message}</button>
      )}
    >
      <Suspense fallback="loading">
        <Thing />
      </Suspense>
    </ErrorBoundary>
  )

  render(<Boundary />)

  fireEvent.click(await screen.findByText('offline'))
  fireEvent.click(await screen.findByText('still offline'))
  expect(await screen.findByText('back')).toBeInTheDocument()
  expect(fetchSpy).toHaveBeenCalledTimes(3)
})
