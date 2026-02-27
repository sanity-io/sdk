import {describe, expect, it} from 'vitest'

import {normalizeResourceOptions} from './useNormalizedResourceOptions'

describe('normalizeResourceOptions', () => {
  it('creates a dataset resource from explicit projectId and dataset', () => {
    const options = {query: '*', projectId: 'project-a', dataset: 'staging'}

    const normalized = normalizeResourceOptions(
      options,
      {},
      {projectId: 'default', dataset: 'prod'},
    )

    expect(normalized).toEqual({
      query: '*',
      resource: {projectId: 'project-a', dataset: 'staging'},
    })
  })
})
