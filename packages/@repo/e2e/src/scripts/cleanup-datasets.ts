#!/usr/bin/env node

/* eslint-disable no-console */
import {type SanityClient} from '@sanity/client'

import {getClient} from '../helpers/clients'
import {getE2EEnv} from '../helpers/getE2EEnv'
import {sanitizeDatasetName} from '../helpers/sanitizeDatasetName'
import {startTimer} from '../helpers/timer'

const env = getE2EEnv()

/**
 * The comments add-on paired to a dataset, when a run wrote a comment.
 *
 * Writing the first comment on a dataset creates one of these, so any spec that
 * exercises comments leaves one behind. The name cannot be derived: the suffix
 * is best-effort and shortens for longer dataset names, so it has to come from
 * the same query the SDK discovers it with.
 */
async function findCommentsAddon(
  client: SanityClient,
  dataset: string,
): Promise<string | undefined> {
  try {
    const datasets = await client.request<{name: string}[] | undefined>({
      url: `/projects/${env.SANITY_APP_E2E_PROJECT_ID}/datasets?datasetProfile=comments&addonFor=${dataset}`,
    })
    return datasets?.[0]?.name
  } catch (error) {
    console.error(`Failed to look up the comments add-on for ${dataset}:`, error)
    return undefined
  }
}

async function deleteDataset(client: SanityClient, label: string, name: string): Promise<void> {
  try {
    await client.datasets.delete(name)
    console.log(`Successfully deleted ${label} ${name}`)
  } catch (error) {
    console.error(`Failed to delete ${label} ${name}:`, error)
  }
}

/**
 * Deletes a run's dataset and the comments add-on paired to it.
 *
 * The add-on goes first. It is only findable through `addonFor=<parent>`, so
 * deleting the parent first risks leaving one behind with no way left to
 * identify it. Add-on datasets are free and off-quota, which is exactly why an
 * orphan would sit there unnoticed.
 */
async function deleteWithAddon(client: SanityClient, label: string, dataset: string) {
  const addon = await findCommentsAddon(client, dataset)
  if (addon) {
    await deleteDataset(client, `${label} comments add-on`, addon)
  }
  await deleteDataset(client, label, dataset)
}

// must be run as a separate script to avoid race conditions with the tests
async function cleanupDatasets() {
  const primaryDataset = sanitizeDatasetName(env.SANITY_APP_E2E_DATASET_0)
  const secondaryDataset = sanitizeDatasetName(env.SANITY_APP_E2E_DATASET_1)
  if (!env.CI) {
    console.log('Skipping cleanup in non-CI environment')
    return
  }

  const client = getClient()

  const timer = startTimer('Cleaning up test datasets')

  try {
    await deleteWithAddon(client, 'primary dataset', primaryDataset)
    await deleteWithAddon(client, 'secondary dataset', secondaryDataset)

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
