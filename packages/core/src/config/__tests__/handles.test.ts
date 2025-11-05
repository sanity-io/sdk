import {describe, expect, it} from 'vitest'

import {
  createAssetHandle,
  createDatasetHandle,
  createDocumentHandle,
  createDocumentTypeHandle,
  createProjectHandle,
} from '../handles'

describe('handle creation functions', () => {
  it('createProjectHandle returns input', () => {
    const input = {projectId: 'test'}
    expect(createProjectHandle(input)).toBe(input)
  })

  it('createDatasetHandle returns input', () => {
    const input = {projectId: 'test', dataset: 'prod'}
    expect(createDatasetHandle(input)).toBe(input)
  })

  it('createDocumentTypeHandle returns input', () => {
    const input = {documentType: 'movie'}
    expect(createDocumentTypeHandle(input)).toBe(input)
  })

  it('createDocumentHandle returns input', () => {
    const input = {documentType: 'movie', documentId: '123'}
    expect(createDocumentHandle(input)).toBe(input)
  })

  it('createAssetHandle returns input', () => {
    const input = {assetId: 'image-abc-1x1-png', projectId: 'p', dataset: 'd'}
    expect(createAssetHandle(input)).toBe(input)
  })
})
