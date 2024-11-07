import {testFunction} from '@sanity/sdk'
// import {useEffect} from 'react'

// import {useSanitySdk} from '../../hooks'

// // eslint-disable-next-line @typescript-eslint/no-explicit-any
// const schema = useSanitySdk((state: any) => state.schema)
// // eslint-disable-next-line @typescript-eslint/no-explicit-any
// const setSchema = useSanitySdk((state: any) => state.setSchema) as (newSchema: any) => void

// useEffect(() => {
//   // eslint-disable-next-line no-console
//   console.log('[+] Schema State updated', schema)
// }, [schema])

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
