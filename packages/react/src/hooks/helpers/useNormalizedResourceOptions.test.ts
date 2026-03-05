import {describe, expect, it} from 'vitest'

import {normalizeResourceOptions} from './useNormalizedResourceOptions'

describe('normalizeResourceOptions', () => {
  it('throws when both resource and resourceName are provided together', () => {
    const resource = {projectId: 'p', dataset: 'd'}

    expect(() =>
      normalizeResourceOptions(
        {resource, resourceName: 'my-resource'},
        {'my-resource': resource},
        undefined,
      ),
    ).toThrow(/cannot be used together/)
  })

  it('throws when no resource can be resolved from any source', () => {
    expect(() =>
      normalizeResourceOptions(
        {},
        {}, // no named resources
        undefined, // no context resource
      ),
    ).toThrow(/resource is required/)
  })

  it('uses explicit resource when provided', () => {
    const resource = {projectId: 'project-a', dataset: 'staging'}

    const normalized = normalizeResourceOptions(
      {resource},
      {},
      {projectId: 'default', dataset: 'prod'},
    )

    expect(normalized).toEqual({resource: {projectId: 'project-a', dataset: 'staging'}})
  })

  it('resolves resource from resourceName', () => {
    const resource = {projectId: 'p', dataset: 'd'}

    const normalized = normalizeResourceOptions(
      {resourceName: 'my-resource'},
      {'my-resource': resource},
      undefined,
    )

    expect(normalized).toEqual({resource})
  })

  it('throws when resourceName is not found in resources map', () => {
    expect(() => normalizeResourceOptions({resourceName: 'missing'}, {}, undefined)).toThrow(
      /no resource named/,
    )
  })

  it('falls back to context resource when neither resource nor resourceName is provided', () => {
    const contextResource = {projectId: 'default', dataset: 'prod'}

    const normalized = normalizeResourceOptions({}, {}, contextResource)

    expect(normalized).toEqual({resource: contextResource})
  })
})
