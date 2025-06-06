import {type SanityConfig} from '@sanity/sdk-react'

export const devConfig: SanityConfig[] = [
  {
    projectId: 'ppsg7ml5',
    dataset: 'test',
  },
  {
    projectId: 'd45jg133',
    dataset: 'production',
  },
]

export const e2eConfig: SanityConfig[] = [
  {
    projectId: '8bzpkfx0',
    dataset: 'production',
    auth: {
      apiHost: 'https://api.sanity.work',
    },
  },
]
