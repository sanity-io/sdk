import {test as setup} from '@playwright/test'

import {getClient} from '../helpers/clients'
import {getE2EEnv} from '../helpers/getE2EEnv'
import {sanitizeDatasetName} from '../helpers/sanitizeDatasetName'
import {startTimer} from '../helpers/timer'

const env = getE2EEnv()

setup('setup test datasets', async () => {
  const primaryDataset = sanitizeDatasetName(env.SDK_E2E_DATASET_0)
  const secondaryDataset = sanitizeDatasetName(env.SDK_E2E_DATASET_1)

  const client = getClient()

  const datasets = await client.datasets.list()

  // Setup primary dataset
  if (!datasets.find((ds) => ds.name === primaryDataset)) {
    const timer = startTimer(`Creating primary dataset ${primaryDataset}`)
    await client.datasets.create(primaryDataset, {
      aclMode: 'public',
    })
    timer.end()
  }

  // Setup secondary dataset
  if (!datasets.find((ds) => ds.name === secondaryDataset)) {
    const timer = startTimer(`Creating secondary dataset ${secondaryDataset}`)
    await client.datasets.create(secondaryDataset, {
      aclMode: 'public',
    })
    timer.end()
  }
})
