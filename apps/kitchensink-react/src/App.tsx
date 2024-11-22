import {createSanityInstance, testFunction} from '@sanity/sdk'
import {TestComponent} from '@sanity/sdk-react/components'

export function App(): JSX.Element {
  const sanityInstance = createSanityInstance({
    projectId: 'ppsg7ml5',
    dataset: 'test',
  })

  return (
    <div>
      <h1>React Kitchensink</h1>
      <h2>Test Function</h2>
      <p>Test Function Output: {testFunction()}</p>
      <h2>Schema</h2>
      <TestComponent sanityInstance={sanityInstance} />
    </div>
  )
}
