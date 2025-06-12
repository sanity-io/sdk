#!/usr/bin/env node

/* eslint-disable no-console */
import {getClient} from '../helpers/clients'
import {getE2EEnv} from '../helpers/getE2EEnv'
import {sanitizeDatasetName} from '../helpers/sanitizeDatasetName'
import {startTimer} from '../helpers/timer'

const env = getE2EEnv()

// must be run as a separate script to avoid race conditions with the tests
async function cleanupDatasets() {
  const primaryDataset = sanitizeDatasetName(env.SDK_E2E_DATASET_0)
  const secondaryDataset = sanitizeDatasetName(env.SDK_E2E_DATASET_1)
  if (!env.CI) {
    console.log('Skipping cleanup in non-CI environment')
    return
  }

  const client = getClient()

  const timer = startTimer('Cleaning up test datasets')

  try {
    // Delete primary dataset
    try {
      await client.datasets.delete(primaryDataset)
      console.log(`Successfully deleted primary dataset ${primaryDataset}`)
    } catch (error) {
      console.error(`Failed to delete primary dataset ${primaryDataset}:`, error)
    }

    // Delete secondary dataset
    try {
      await client.datasets.delete(secondaryDataset)
      console.log(`Successfully deleted secondary dataset ${secondaryDataset}`)
    } catch (error) {
      console.error(`Failed to delete secondary dataset ${secondaryDataset}:`, error)
    }

    timer.end()
  } catch (error) {
    console.error('Failed to cleanup datasets:', error)
    process.exit(1)
  }
}

cleanupDatasets().catch((error) => {
  console.error('Unhandled error during cleanup:', error)
  process.exit(1)
})
