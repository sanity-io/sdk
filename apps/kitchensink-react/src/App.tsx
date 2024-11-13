import {createSanityInstance, testFunction} from '@sanity/sdk'
import {type SanityInstance, useDocumentList} from '@sanity/sdk-react/hooks'

export function App(): JSX.Element {
  const sanityInstance = createSanityInstance({
    projectId: 'project-id',
    dataset: 'dataset',
  })
  const {documents, isLoading} = useDocumentList(
    {type: 'movies', filter: '2'},
    sanityInstance as unknown as SanityInstance, // TODO: weirdness with the types here
  )
  // eslint-disable-next-line no-console
  console.log(documents, isLoading)
  return (
    <div>
      <h1>React Kitchensink</h1>
      <h2>Test Function</h2>
      <p>Test Function Output: {testFunction()}</p>
      <h2>Movies that have 2 in the title</h2>
      {isLoading ? <p>Loading...</p> : <p>Documents: {JSON.stringify(documents)}</p>}
    </div>
  )
}
