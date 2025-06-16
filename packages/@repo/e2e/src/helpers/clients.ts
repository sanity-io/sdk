import {createClient, type SanityClient} from '@sanity/client'

import {getE2EEnv} from './getE2EEnv'

const env = getE2EEnv()

const baseConfig = {
  projectId: env.SDK_E2E_PROJECT_ID,
  token: env.SDK_E2E_SESSION_TOKEN,
  useCdn: false,
  apiVersion: '2021-08-31',
  apiHost: 'https://api.sanity.work',
}

const clients: Record<string, SanityClient> = {}

export function getClient(dataset: string = env.SDK_E2E_DATASET_0): SanityClient {
  if (!clients[dataset]) {
    clients[dataset] = createClient({
      ...baseConfig,
      dataset,
    })
  }

  return clients[dataset]
}
