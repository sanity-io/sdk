import {type DocumentResource} from '@sanity/sdk'
import {render, waitFor} from '@testing-library/react'
import {Suspense} from 'react'
import {describe, expect, it} from 'vitest'

import {OrgInferenceContext} from '../../context/OrgInferenceContext'
import {ResourcesContext} from '../../context/ResourcesContext'
import {useNormalizedResourceOptions} from './useNormalizedResourceOptions'

function promiseWithResolvers<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
} {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return {promise, resolve}
}

function ResourceConsumer({resourceName}: {resourceName: string}) {
  const {resource} = useNormalizedResourceOptions({resourceName})
  return <div data-testid="result">{JSON.stringify(resource)}</div>
}

describe('useNormalizedResourceOptions — suspension', () => {
  it('suspends while the org inference promise is pending', () => {
    const {promise} = promiseWithResolvers<Record<string, DocumentResource>>()

    const {queryByTestId, getByText} = render(
      <OrgInferenceContext.Provider value={promise}>
        <ResourcesContext.Provider value={{}}>
          <Suspense fallback={<div>loading</div>}>
            <ResourceConsumer resourceName="media-library" />
          </Suspense>
        </ResourcesContext.Provider>
      </OrgInferenceContext.Provider>,
    )

    expect(getByText('loading')).toBeInTheDocument()
    expect(queryByTestId('result')).not.toBeInTheDocument()
  })

  it('renders with the inferred resource once the promise resolves', async () => {
    const {promise, resolve} = promiseWithResolvers<Record<string, DocumentResource>>()

    const {getByTestId} = render(
      <OrgInferenceContext.Provider value={promise}>
        <ResourcesContext.Provider value={{}}>
          <Suspense fallback={<div>loading</div>}>
            <ResourceConsumer resourceName="media-library" />
          </Suspense>
        </ResourcesContext.Provider>
      </OrgInferenceContext.Provider>,
    )

    resolve({'media-library': {mediaLibraryId: 'ml-123'}})

    await waitFor(() => expect(getByTestId('result')).toBeInTheDocument())
    expect(JSON.parse(getByTestId('result').textContent!)).toEqual({mediaLibraryId: 'ml-123'})
  })

  it('does not suspend when inferencePromise is null', () => {
    const {getByTestId} = render(
      <OrgInferenceContext.Provider value={null}>
        <ResourcesContext.Provider value={{'media-library': {mediaLibraryId: 'explicit'}}}>
          <Suspense fallback={<div>loading</div>}>
            <ResourceConsumer resourceName="media-library" />
          </Suspense>
        </ResourcesContext.Provider>
      </OrgInferenceContext.Provider>,
    )

    expect(getByTestId('result')).toBeInTheDocument()
  })

  it('does not suspend for non-inferred resource names even when inference is pending', () => {
    const {promise} = promiseWithResolvers<Record<string, DocumentResource>>()

    const {getByTestId} = render(
      <OrgInferenceContext.Provider value={promise}>
        <ResourcesContext.Provider value={{default: {projectId: 'p', dataset: 'd'}}}>
          <Suspense fallback={<div>loading</div>}>
            <ResourceConsumer resourceName="default" />
          </Suspense>
        </ResourcesContext.Provider>
      </OrgInferenceContext.Provider>,
    )

    expect(getByTestId('result')).toBeInTheDocument()
  })

  it('does not suspend when the resource is already in the explicit map', () => {
    const {promise} = promiseWithResolvers<Record<string, DocumentResource>>()

    const {getByTestId} = render(
      <OrgInferenceContext.Provider value={promise}>
        <ResourcesContext.Provider value={{'media-library': {mediaLibraryId: 'override'}}}>
          <Suspense fallback={<div>loading</div>}>
            <ResourceConsumer resourceName="media-library" />
          </Suspense>
        </ResourcesContext.Provider>
      </OrgInferenceContext.Provider>,
    )

    expect(getByTestId('result')).toBeInTheDocument()
    expect(JSON.parse(getByTestId('result').textContent!)).toEqual({mediaLibraryId: 'override'})
  })
})
