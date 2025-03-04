import {beforeEach, describe, expect, test} from 'vitest'

import {disposeResources} from '../resources/createResource'
import {createSanityInstance} from './sanityInstance'
import {type SanityConfig} from './types'

vi.mock('../resources/createResource')

describe('sanityInstance', () => {
  let config: SanityConfig

  beforeEach(() => {
    config = {
      resources: [
        {
          projectId: 'test-project',
          dataset: 'test-dataset',
        },
      ],
    }
  })

  describe('createSanityInstance', () => {
    test('creates instance with correct configuration', () => {
      const instance = createSanityInstance(config)

      expect(instance.resources).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            projectId: 'test-project',
            dataset: 'test-dataset',
          }),
        ]),
      )
    })

    test('instance.dispose', () => {
      const instance = createSanityInstance(config)
      instance.dispose()

      expect(disposeResources).toHaveBeenCalled()
    })
  })
})
