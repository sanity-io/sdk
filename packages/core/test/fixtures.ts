import {type SanityConfig, createSanityInstance} from '../src/instance/sanityInstance'
import type {SanityInstance} from '../src/instance/types'

export const config: SanityConfig = {
  projectId: 'test-project-id',
  dataset: 'test-dataset',
}

/*
 * The sanityInstance is stateful, so be careful about where you use it
 */
export const sanityInstance: SanityInstance = createSanityInstance(config)
