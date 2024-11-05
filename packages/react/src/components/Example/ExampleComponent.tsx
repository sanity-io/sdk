import {testFunction} from '@sanity/sdk'
// import {schemaTestSubscribe, setSchema, testFunction} from 'sdk-core'

// schemaTestSubscribe()

// setSchema({
//   types: [
//     {
//       name: 'person',
//       type: 'document',
//       fields: [
//         {
//           name: 'name',
//           type: 'string',
//         },
//         {
//           name: 'age',
//           type: 'number',
//         },
//       ],
//     },
//   ],
// })

function ExampleComponent(): JSX.Element {
  return (
    <>
      <p>Example component</p>
      <div>{testFunction()}</div>
    </>
  )
}

export default ExampleComponent
