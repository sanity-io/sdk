import {describe, expect, it} from 'vitest'

import {createDocumentHandle, createDocumentTypeHandle} from '../handles'

describe('handle creation functions', () => {
  it('createDocumentTypeHandle returns input', () => {
    const input = {documentType: 'movie', resource: {projectId: 'p', dataset: 'd'}}
    expect(createDocumentTypeHandle(input)).toBe(input)
  })

  it('createDocumentHandle returns input', () => {
    const input = {
      documentType: 'movie',
      documentId: '123',
      resource: {projectId: 'p', dataset: 'd'},
    }
    expect(createDocumentHandle(input)).toBe(input)
  })
})
