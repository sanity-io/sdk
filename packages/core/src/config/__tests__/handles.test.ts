import {describe, expect, it} from 'vitest'

import {
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
})
