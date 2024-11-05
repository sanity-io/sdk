import {testFunction} from '@sanity/sdk'

function ExampleComponent(): JSX.Element {
  return (
    <>
      <p>Example component</p>
      <div>{testFunction()}</div>
    </>
  )
}

export default ExampleComponent
