import {Grid} from '@sanity/ui'

/**
 * This is an example of using the hook to
 * get the documents using a query and creating
 * custom integrations or apps inside COSI
 */
function useDocuments(q: string) {
  // hacky code to get the type from "groq" query (ignore)
  const type = q.match(/_type == "(.*)"/)?.[1]

  return new Array(50).fill(0).map((_, i) => ({
    id: `document-${i}`,
    title: `${type?.charAt(0)?.toUpperCase()}${type?.slice(1)} Document ${i}`,
    subtitle: `Subtitle ${i}`,
  }))
}

export function CustomHook(): JSX.Element {
  const documents = useDocuments(`*[_type == "person"]`)

  return (
    <>
      <h1>Custom Hook</h1>
      <Grid columns={[2, 3, 4, 5]} gap={2} padding={3}>
        {documents.map((document) => (
          <div key={document.id}>
            <h2>{document.title}</h2>
            <p>{document.subtitle}</p>
          </div>
        ))}
      </Grid>
    </>
  )
}
