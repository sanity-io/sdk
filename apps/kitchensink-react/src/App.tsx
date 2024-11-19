import {testFunction} from '@sanity/sdk'
import {LoginLinks} from '@sanity/sdk-react/components'

export function App(): JSX.Element {
  return (
    <div>
      <h1>React Kitchensink</h1>
      <h2>Test Function</h2>
      <p>Test Function Output: {testFunction()}</p>
      <h2>Schema</h2>
      <LoginLinks projectId="r500rrr6" />
    </div>
  )
}
