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

  it('creates a media library resource from mediaLibraryId', () => {
    const normalized = normalizeResourceOptions({query: '*', mediaLibraryId: 'ml-123'}, {})

    expect(normalized).toEqual({
      query: '*',
      resource: {mediaLibraryId: 'ml-123'},
    })
  })

  it('creates a canvas resource from canvasId', () => {
    const normalized = normalizeResourceOptions({query: '*', canvasId: 'canvas-456'}, {})

    expect(normalized).toEqual({
      query: '*',
      resource: {canvasId: 'canvas-456'},
    })
  })

  it('throws when both resource and resourceName are provided together', () => {
    const resource = {projectId: 'p', dataset: 'd'}

    expect(() =>
      normalizeResourceOptions(
        {query: '*', resource, resourceName: 'my-resource'},
        {'my-resource': resource},
        undefined,
      ),
    ).toThrow(/cannot be used together/)
  })

  it('throws when no resource can be resolved from any source', () => {
    expect(() =>
      normalizeResourceOptions(
        // @ts-expect-error -- test invalid options
        {query: '*'},
        {}, // no named resources
        undefined, // no context resource
      ),
    ).toThrow(/resource is required/)
  })
})
