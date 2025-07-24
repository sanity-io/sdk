import {describe, expect, test} from 'vitest'

import {defineIntent, type Intent, type IntentFilter} from './defineIntent'

describe('defineIntent', () => {
  test('should return a valid intent object when all required fields are provided', () => {
    const intent: Intent = {
      id: 'viewHat',
      action: 'view',
      title: 'View a hat',
      description: 'This lets you view a hat',
      filters: [
        {
          projectId: 'some-project',
          dataset: 'a-dataset',
          types: ['hat'],
        },
      ],
    }

    const result = defineIntent(intent)

    expect(result).toEqual(intent)
    expect(result).toBe(intent)
  })

  test('should throw error when filters array is empty', () => {
    const intent: Intent = {
      id: 'globalIntent',
      action: 'create',
      title: 'Global Intent',
      description: 'An intent with no filters',
      filters: [],
    }

    expect(() => defineIntent(intent)).toThrow(
      "Intent must have at least one filter. If you want to match everything, use {types: ['*']}",
    )
  })

  test('should work with wildcard filter to match everything', () => {
    const intent: Intent = {
      id: 'globalIntent',
      action: 'create',
      title: 'Global Intent',
      description: 'An intent that matches everything',
      filters: [
        {
          types: ['*'],
        },
      ],
    }

    const result = defineIntent(intent)

    expect(result).toEqual(intent)
    expect(result.filters[0].types).toEqual(['*'])
  })

  test('should work with partial filters', () => {
    const intent: Intent = {
      id: 'partialFilter',
      action: 'edit',
      title: 'Partial Filter Intent',
      description: 'An intent with partial filter criteria',
      filters: [
        {
          projectId: 'some-project',
          types: ['*'], // Add required types
        },
        {
          types: ['document'],
          // No projectId or dataset specified
        },
      ],
    }

    const result = defineIntent(intent)

    expect(result).toEqual(intent)
  })

  test('should throw error when id is missing', () => {
    const intent = {
      action: 'view',
      title: 'Test Intent',
      description: 'Test description',
      filters: [],
    } as unknown as Intent

    expect(() => defineIntent(intent)).toThrow('Intent must have an id')
  })

  test('should throw error when id is empty string', () => {
    const intent: Intent = {
      id: '',
      action: 'view',
      title: 'Test Intent',
      description: 'Test description',
      filters: [],
    }

    expect(() => defineIntent(intent)).toThrow('Intent must have an id')
  })

  test('should throw error when action is missing', () => {
    const intent = {
      id: 'test',
      title: 'Test Intent',
      description: 'Test description',
      filters: [],
    } as unknown as Intent

    expect(() => defineIntent(intent)).toThrow('Intent must have an action')
  })

  test('should throw error when action is empty string', () => {
    const intent = {
      id: 'test',
      action: '',
      title: 'Test Intent',
      description: 'Test description',
      filters: [],
    } as unknown as Intent

    expect(() => defineIntent(intent)).toThrow('Intent must have an action')
  })

  test('should throw error when title is missing', () => {
    const intent = {
      id: 'test',
      action: 'view',
      description: 'Test description',
      filters: [],
    } as unknown as Intent

    expect(() => defineIntent(intent)).toThrow('Intent must have a title')
  })

  test('should throw error when title is empty string', () => {
    const intent: Intent = {
      id: 'test',
      action: 'view',
      title: '',
      description: 'Test description',
      filters: [],
    }

    expect(() => defineIntent(intent)).toThrow('Intent must have a title')
  })

  test('should throw error when filters are missing', () => {
    const intent = {
      id: 'test',
      action: 'view',
      title: 'Test Intent',
      description: 'Test description',
    } as unknown as Intent

    expect(() => defineIntent(intent)).toThrow('Intent must have a filters array')
  })

  test('should throw error when filters are not an array', () => {
    const intent = {
      id: 'test',
      action: 'view',
      title: 'Test Intent',
      description: 'Test description',
      filters: 'not an array',
    } as unknown as Intent

    expect(() => defineIntent(intent)).toThrow('Intent must have a filters array')
  })

  test('should work with complex filter combinations', () => {
    const intent: Intent = {
      id: 'complexIntent',
      action: 'edit',
      title: 'Complex Intent',
      description: 'An intent with multiple complex filters',
      filters: [
        {
          projectId: 'project-1',
          dataset: 'production',
          types: ['article', 'blogPost'],
        },
        {
          projectId: 'project-2',
          dataset: 'staging',
          types: ['product'],
        },
        {
          // Filter with only types
          types: ['global-document'],
        },
      ],
    }

    const result = defineIntent(intent)

    expect(result).toEqual(intent)
    expect(result.filters).toHaveLength(3)
    expect(result.filters[0].types).toEqual(['article', 'blogPost'])
    expect(result.filters[2].projectId).toBeUndefined()
    expect(result.filters[2].dataset).toBeUndefined()
  })

  // Filter validation tests
  test('should throw error for empty filter object', () => {
    const intent = {
      id: 'test',
      action: 'view',
      title: 'Test Intent',
      description: 'Test description',
      filters: [{}],
    } as unknown as Intent

    expect(() => defineIntent(intent)).toThrow(
      "Filter at index 0 must have a types property. Use ['*'] to match all document types.",
    )
  })

  test('should throw error for non-object filter', () => {
    const intent = {
      id: 'test',
      action: 'view',
      title: 'Test Intent',
      description: 'Test description',
      filters: ['not an object'],
    } as unknown as Intent

    expect(() => defineIntent(intent)).toThrow('Filter at index 0 must be an object')
  })

  test('should throw error for non-string projectId', () => {
    const intent = {
      id: 'test',
      action: 'view',
      title: 'Test Intent',
      description: 'Test description',
      filters: [{projectId: 123, types: ['*']}],
    } as unknown as Intent

    expect(() => defineIntent(intent)).toThrow('Filter at index 0: projectId must be a string')
  })

  test('should throw error for empty projectId', () => {
    const intent: Intent = {
      id: 'test',
      action: 'view',
      title: 'Test Intent',
      description: 'Test description',
      filters: [{projectId: '', types: ['*']}],
    }

    expect(() => defineIntent(intent)).toThrow('Filter at index 0: projectId cannot be empty')
  })

  test('should throw error for whitespace-only projectId', () => {
    const intent: Intent = {
      id: 'test',
      action: 'view',
      title: 'Test Intent',
      description: 'Test description',
      filters: [{projectId: '   ', types: ['*']}],
    }

    expect(() => defineIntent(intent)).toThrow('Filter at index 0: projectId cannot be empty')
  })

  test('should throw error for non-string dataset', () => {
    const intent = {
      id: 'test',
      action: 'view',
      title: 'Test Intent',
      description: 'Test description',
      filters: [{projectId: 'test', dataset: 123, types: ['*']}],
    } as unknown as Intent

    expect(() => defineIntent(intent)).toThrow('Filter at index 0: dataset must be a string')
  })

  test('should throw error for empty dataset', () => {
    const intent: Intent = {
      id: 'test',
      action: 'view',
      title: 'Test Intent',
      description: 'Test description',
      filters: [{dataset: '', types: ['*']}],
    }

    expect(() => defineIntent(intent)).toThrow('Filter at index 0: dataset cannot be empty')
  })

  test('should throw error when dataset is specified without projectId', () => {
    const intent: Intent = {
      id: 'test',
      action: 'view',
      title: 'Test Intent',
      description: 'Test description',
      filters: [{dataset: 'production', types: ['*']}],
    }

    expect(() => defineIntent(intent)).toThrow(
      'Filter at index 0: dataset cannot be specified without projectId',
    )
  })

  test('should throw error when dataset is specified with empty projectId', () => {
    const intent: Intent = {
      id: 'test',
      action: 'view',
      title: 'Test Intent',
      description: 'Test description',
      filters: [{projectId: '', dataset: 'production', types: ['*']}],
    }

    expect(() => defineIntent(intent)).toThrow('Filter at index 0: projectId cannot be empty')
  })

  test('should work when dataset is specified with valid projectId', () => {
    const intent: Intent = {
      id: 'test',
      action: 'view',
      title: 'Test Intent',
      description: 'Test description',
      filters: [{projectId: 'my-project', dataset: 'production', types: ['*']}],
    }

    const result = defineIntent(intent)
    expect(result).toEqual(intent)
  })

  test('should throw error for non-array types', () => {
    const intent = {
      id: 'test',
      action: 'view',
      title: 'Test Intent',
      description: 'Test description',
      filters: [{types: 'not-an-array'}],
    } as unknown as Intent

    expect(() => defineIntent(intent)).toThrow('Filter at index 0: types must be an array')
  })

  test('should throw error for empty types array', () => {
    const intent: Intent = {
      id: 'test',
      action: 'view',
      title: 'Test Intent',
      description: 'Test description',
      filters: [{types: []}],
    }

    expect(() => defineIntent(intent)).toThrow('Filter at index 0: types array cannot be empty')
  })

  test('should throw error for non-string type in types array', () => {
    const intent = {
      id: 'test',
      action: 'view',
      title: 'Test Intent',
      description: 'Test description',
      filters: [{types: ['valid', 123, 'also-valid']}],
    } as unknown as Intent

    expect(() => defineIntent(intent)).toThrow('Filter at index 0: types[1] must be a string')
  })

  test('should throw error for empty string in types array', () => {
    const intent: Intent = {
      id: 'test',
      action: 'view',
      title: 'Test Intent',
      description: 'Test description',
      filters: [{types: ['valid', '', 'also-valid']}],
    }

    expect(() => defineIntent(intent)).toThrow('Filter at index 0: types[1] cannot be empty')
  })

  test('should throw error for whitespace-only string in types array', () => {
    const intent: Intent = {
      id: 'test',
      action: 'view',
      title: 'Test Intent',
      description: 'Test description',
      filters: [{types: ['valid', '   ', 'also-valid']}],
    }

    expect(() => defineIntent(intent)).toThrow('Filter at index 0: types[1] cannot be empty')
  })

  test('should throw error when wildcard is mixed with other types', () => {
    const intent: Intent = {
      id: 'test',
      action: 'view',
      title: 'Test Intent',
      description: 'Test description',
      filters: [{types: ['*', 'document']}],
    }

    expect(() => defineIntent(intent)).toThrow(
      "Filter at index 0: when using wildcard '*', it must be the only type in the array",
    )
  })

  test('should throw error when wildcard appears with other types in different order', () => {
    const intent: Intent = {
      id: 'test',
      action: 'view',
      title: 'Test Intent',
      description: 'Test description',
      filters: [{types: ['document', 'article', '*']}],
    }

    expect(() => defineIntent(intent)).toThrow(
      "Filter at index 0: when using wildcard '*', it must be the only type in the array",
    )
  })

  test('should work with valid individual filter properties', () => {
    const intent: Intent = {
      id: 'test',
      action: 'view',
      title: 'Test Intent',
      description: 'Test description',
      filters: [
        {projectId: 'my-project', types: ['*']},
        {projectId: 'my-project', dataset: 'production', types: ['*']},
        {types: ['document']},
        {types: ['*']}, // Valid wildcard usage
      ],
    }

    const result = defineIntent(intent)
    expect(result).toEqual(intent)
  })

  test('should provide correct filter index in error messages for multiple filters', () => {
    const intent: Intent = {
      id: 'test',
      action: 'view',
      title: 'Test Intent',
      description: 'Test description',
      filters: [
        {projectId: 'valid-project', types: ['*']},
        {projectId: '', types: ['*']},
      ],
    }

    expect(() => defineIntent(intent)).toThrow('Filter at index 1: projectId cannot be empty')
  })
})

describe('IntentFilter interface', () => {
  test('should require types property', () => {
    // This is more of a TypeScript compile-time test
    // but we can verify the structure is as expected
    const filter1: IntentFilter = {types: ['*']} // types is now required
    const filter2: IntentFilter = {projectId: 'test', types: ['*']} // types is now required
    const filter3: IntentFilter = {dataset: 'test', types: ['*']} // types is now required
    const filter4: IntentFilter = {types: ['test']}
    const filter5: IntentFilter = {
      projectId: 'test',
      dataset: 'test',
      types: ['test'],
    }

    // These should all be valid filter objects
    expect(filter1).toBeDefined()
    expect(filter2).toBeDefined()
    expect(filter3).toBeDefined()
    expect(filter4).toBeDefined()
    expect(filter5).toBeDefined()
  })
})
