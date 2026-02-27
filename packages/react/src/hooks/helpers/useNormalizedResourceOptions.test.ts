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

  it('throws when projectId is provided without dataset', () => {
    expect(() =>
      normalizeResourceOptions(
        {query: '*', projectId: 'project-a'},
        {},
        {projectId: 'default', dataset: 'prod'},
      ),
    ).toThrow('projectId and dataset must be provided together')
  })

  it('throws when dataset is provided without projectId', () => {
    expect(() =>
      normalizeResourceOptions(
        {query: '*', dataset: 'staging'},
        {},
        {projectId: 'default', dataset: 'prod'},
      ),
    ).toThrow('projectId and dataset must be provided together')
  })
})
