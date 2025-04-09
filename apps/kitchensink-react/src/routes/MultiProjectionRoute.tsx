import {type DocumentHandle} from '@sanity/sdk'
import {usePaginatedDocuments, useProjection} from '@sanity/sdk-react'
import {Box, Card, Flex, Heading, Stack, Text} from '@sanity/ui'
import {type JSX, Suspense} from 'react'

interface NameProjection {
  name: string
}

interface BioProjection {
  _type: string
}

function DocumentProjections({document}: {document: DocumentHandle}) {
  const {data: nameData, isPending: nameIsPending} = useProjection<NameProjection>({
    ...document,
    projection: '{name}',
  })

  const {data: bioData, isPending: bioIsPending} = useProjection<BioProjection>({
    ...document,
    projection: '{_type}',
  })

  return (
    <Card padding={3} border radius={2}>
      <Flex gap={4}>
        <Box flex={1}>
          <Text weight="semibold" size={1}>
            Name Projection
          </Text>
          <Card
            padding={3}
            tone="transparent"
            border
            radius={2}
            style={{opacity: nameIsPending ? 0.5 : 1}}
          >
            <pre style={{margin: 0}}>{JSON.stringify(nameData, null, 2)}</pre>
          </Card>
        </Box>
        <Box flex={1}>
          <Text weight="semibold" size={1}>
            Bio Projection
          </Text>
          <Card
            padding={3}
            tone="transparent"
            border
            radius={2}
            style={{opacity: bioIsPending ? 0.5 : 1}}
          >
            <pre style={{margin: 0}}>{JSON.stringify(bioData, null, 2)}</pre>
          </Card>
        </Box>
      </Flex>
    </Card>
  )
}

export function MultiProjectionRoute(): JSX.Element {
  const {data: documents} = usePaginatedDocuments({
    filter: '_type == "author"',
    pageSize: 5,
    orderings: [{field: 'name', direction: 'asc'}],
  })

  return (
    <Box padding={4}>
      <Stack space={4}>
        <Heading as="h1" size={4}>
          Multiple Projections Demo
        </Heading>
        <Text muted>
          This demo shows using multiple useProjection hooks on the same document to fetch different
          fields.
        </Text>

        <Stack space={3}>
          {documents.map((doc) => (
            <Suspense
              key={doc.documentId}
              fallback={
                <Card padding={3} border>
                  Loading...
                </Card>
              }
            >
              <DocumentProjections document={doc} />
            </Suspense>
          ))}
        </Stack>
      </Stack>
    </Box>
  )
}
