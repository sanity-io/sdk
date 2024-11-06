import {testFunction} from '@sanity/sdk'
import {useSanitySdk} from '@sanity/sdk-react'

export function App(): JSX.Element {
  const schema = useSanitySdk((state) => state.schema)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const setSchema = useSanitySdk((state) => state.setSchema) as (newSchema: any) => void
  const onSetSchema = () =>
    setSchema({
      types: [
        {
          name: 'person',
          type: 'document',
          fields: [
            {
              name: 'name',
              type: 'string',
            },
            {
              name: 'age',
              type: 'number',
            },
          ],
        },
      ],
    })

  return (
    <div>
      <h1>React Kitchensink</h1>
      <h2>Test Function</h2>
      <p>Test Function Output: {testFunction()}</p>
      <h2>Schema</h2>
      <button onClick={onSetSchema}>Load Schema</button>
      <p>{JSON.stringify(schema)}</p>
    </div>
  )
}
