import {testFunction} from 'sdk-core'

function ExampleComponent(): JSX.Element {
  return (
    <>
      <p>Example component</p>
      <div>{testFunction()}</div>
    </>
  )
}

export default ExampleComponent
