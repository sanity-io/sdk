import {testFunction} from '@sanity/sdk-core'

function ExampleComponent(): JSX.Element {
  return (
    <>
      <p>Example component</p>
      <div>{testFunction()}</div>
    </>
  )
}

export default ExampleComponent
