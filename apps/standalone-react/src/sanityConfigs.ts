import {type SanityConfig} from '@sanity/sdk'

// Mirrors apps/kitchensink-react/src/sanityConfigs.ts `devConfigs` so both
// example apps point at the same projects and datasets.
export const devConfigs: SanityConfig[] = [
  {
    projectId: 'ppsg7ml5',
    dataset: 'test',
  },
  {
    projectId: 'vo1ysemo',
    dataset: 'production',
  },
]
