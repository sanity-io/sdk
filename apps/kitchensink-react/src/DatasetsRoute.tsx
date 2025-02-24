import {useDatasets} from '@sanity/sdk-react/hooks'
import {Card, Flex, Stack, Text} from '@sanity/ui'
import {type JSX} from 'react'

export function DatasetsRoute(): JSX.Element {
  const datasets = useDatasets()

  return (
    <div>
      <Text size={4} weight="bold">
        Datasets
      </Text>
      <Stack marginTop={3} space={[3, 3, 4]}>
        {datasets.map((dataset) => (
          <Card padding={[3, 3, 4]} radius={2} shadow={1} tone="primary" key={dataset.name}>
            <Flex justify="space-between" align="center">
              <Text size={3}>{dataset.name}</Text>
              <Text muted>{dataset.aclMode}</Text>
            </Flex>
          </Card>
        ))}
      </Stack>
    </div>
  )
}
