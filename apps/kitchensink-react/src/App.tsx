import {testFunction} from '@sanity/sdk'

export function App(): JSX.Element {
  return (
    <div>
      <h1>React Kitchensink</h1>
      <h2>Test Function</h2>
      <p>Test Function Output: {testFunction()}</p>
      <h2>Schema</h2>
    </div>
  )
}
