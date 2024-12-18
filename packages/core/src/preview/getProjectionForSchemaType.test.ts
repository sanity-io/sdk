import {Schema} from '@sanity/schema'
import {describe, expect, it} from 'vitest'

import {getProjectionForSchemaType} from './getProjectionForSchemaType'

describe('getProjectionForSchemaType', () => {
  it('throws error when schema type not found', () => {
    const schema = Schema.compile({
      name: 'default',
      types: [],
    })

    expect(() => getProjectionForSchemaType(schema, 'nonexistent')).toThrow(
      'Could not find type `nonexistent` in the provided schema.',
    )
  })

  it('handles basic fields without preview select', () => {
    const schema = Schema.compile({
      name: 'default',
      types: [
        {
          name: 'test',
          type: 'document',
          fields: [{name: 'title', type: 'string'}],
        },
      ],
    })

    expect(getProjectionForSchemaType(schema, 'test')).toBe('{"title":title}')
  })

  it('handles simple preview select with direct fields', () => {
    const schema = Schema.compile({
      name: 'default',
      types: [
        {
          name: 'test',
          type: 'document',
          fields: [
            {name: 'title', type: 'string'},
            {name: 'subtitle', type: 'string'},
          ],
          preview: {
            select: {
              title: 'title',
              subtitle: 'subtitle',
            },
          },
        },
      ],
    })

    expect(getProjectionForSchemaType(schema, 'test')).toBe('{"title":title,"subtitle":subtitle}')
  })

  it('handles nested object fields', () => {
    const schema = Schema.compile({
      name: 'default',
      types: [
        {
          name: 'test',
          type: 'document',
          fields: [
            {
              name: 'metadata',
              type: 'object',
              fields: [
                {name: 'title', type: 'string'},
                {name: 'description', type: 'string'},
              ],
            },
          ],
          preview: {
            select: {
              title: 'metadata.title',
              subtitle: 'metadata.description',
            },
          },
        },
      ],
    })

    expect(getProjectionForSchemaType(schema, 'test')).toBe(
      '{"title":metadata.title,"subtitle":metadata.description}',
    )
  })

  it('handles array fields with object items', () => {
    const schema = Schema.compile({
      name: 'default',
      types: [
        {
          name: 'test',
          type: 'document',
          fields: [
            {
              name: 'items',
              type: 'array',
              of: [
                {
                  type: 'object',
                  fields: [{name: 'title', type: 'string'}],
                },
              ],
            },
          ],
          preview: {
            select: {
              title: 'items.0.title',
            },
          },
        },
      ],
    })

    expect(getProjectionForSchemaType(schema, 'test')).toBe('{"title":items[0].title}')
  })

  it('handles single reference fields', () => {
    const schema = Schema.compile({
      name: 'default',
      types: [
        {
          name: 'test',
          type: 'document',
          fields: [
            {
              name: 'author',
              type: 'reference',
              to: [{type: 'author'}],
            },
          ],
          preview: {
            select: {
              title: 'author.name',
            },
          },
        },
        {
          name: 'author',
          type: 'document',
          fields: [{name: 'name', type: 'string'}],
        },
      ],
    })

    expect(getProjectionForSchemaType(schema, 'test')).toBe('{"title":author->name}')
  })

  it('handles multiple reference fields with different types', () => {
    const schema = Schema.compile({
      name: 'default',
      types: [
        {
          name: 'test',
          type: 'document',
          fields: [
            {
              name: 'reference',
              type: 'reference',
              to: [{type: 'person'}, {type: 'organization'}],
            },
          ],
          preview: {
            select: {
              title: 'reference.name',
              subtitle: 'reference.description',
            },
          },
        },
        {
          name: 'person',
          type: 'document',
          fields: [
            {name: 'name', type: 'string'},
            {name: 'description', type: 'string'},
          ],
        },
        {
          name: 'organization',
          type: 'document',
          fields: [
            {name: 'name', type: 'string'},
            {name: 'description', type: 'string'},
          ],
        },
      ],
    })

    expect(getProjectionForSchemaType(schema, 'test')).toBe(
      '{"title":reference->name,"subtitle":reference->description}',
    )
  })

  it('handles deeply nested references', () => {
    const schema = Schema.compile({
      name: 'default',
      types: [
        {
          name: 'test',
          type: 'document',
          fields: [
            {
              name: 'mainReference',
              type: 'reference',
              to: [{type: 'intermediate'}],
            },
          ],
          preview: {
            select: {
              title: 'mainReference.subReference.name',
            },
          },
        },
        {
          name: 'intermediate',
          type: 'document',
          fields: [
            {
              name: 'subReference',
              type: 'reference',
              to: [{type: 'target'}],
            },
          ],
        },
        {
          name: 'target',
          type: 'document',
          fields: [{name: 'name', type: 'string'}],
        },
      ],
    })

    expect(getProjectionForSchemaType(schema, 'test')).toBe(
      '{"title":mainReference->subReference->name}',
    )
  })

  it('handles array fields with references', () => {
    const schema = Schema.compile({
      name: 'default',
      types: [
        {
          name: 'test',
          type: 'document',
          fields: [
            {
              name: 'references',
              type: 'array',
              of: [
                {
                  type: 'reference',
                  to: [{type: 'target'}],
                },
              ],
            },
          ],
          preview: {
            select: {
              title: 'references.0.name',
            },
          },
        },
        {
          name: 'target',
          type: 'document',
          fields: [{name: 'name', type: 'string'}],
        },
      ],
    })

    expect(getProjectionForSchemaType(schema, 'test')).toBe('{"title":references[0]->name}')
  })

  it('handles special system fields starting with _', () => {
    const schema = Schema.compile({
      name: 'default',
      types: [
        {
          name: 'test',
          type: 'document',
          fields: [{name: 'title', type: 'string'}],
          preview: {
            select: {
              id: '_id',
              type: '_type',
              updated: '_updatedAt',
              title: 'title',
              nested: '_someFutureProp.array.0.name',
            },
          },
        },
      ],
    })

    expect(getProjectionForSchemaType(schema, 'test')).toBe(
      '{"id":_id,"type":_type,"updated":_updatedAt,"title":title,"nested":_someFutureProp.array[0].name}',
    )
  })

  it('returns null when given invalid paths', () => {
    const schema = Schema.compile({
      name: 'default',
      types: [
        {
          name: 'test',
          type: 'document',
          fields: [{name: 'title', type: 'string'}],
          preview: {
            select: {
              title: 'nonexistentField.subfield',
              subtitle: 'invalidPath.that.doesnt.exist',
            },
          },
        },
      ],
    })

    expect(getProjectionForSchemaType(schema, 'test')).toBe('{"title":null,"subtitle":null}')
  })

  it('returns null when trying to access a non-object, reference, or array type', () => {
    const schema = Schema.compile({
      name: 'default',
      types: [
        {
          name: 'test',
          type: 'document',
          fields: [
            {name: 'title', type: 'string'},
            {
              name: 'notAnObject',
              type: 'string',
            },
          ],
          preview: {
            select: {
              title: 'notAnObject.throws',
            },
          },
        },
      ],
    })

    expect(getProjectionForSchemaType(schema, 'test')).toBe('{"title":null}')
  })

  it('handles cyclic references', () => {
    const schema = Schema.compile({
      name: 'default',
      types: [
        {
          name: 'test',
          type: 'document',
          fields: [
            {
              name: 'selfReference',
              type: 'reference',
              to: [{type: 'test'}],
            },
            {
              name: 'title',
              type: 'string',
            },
          ],
          preview: {
            select: {
              title: 'selfReference.selfReference.title',
            },
          },
        },
      ],
    })

    expect(getProjectionForSchemaType(schema, 'test')).toBe(
      '{"title":selfReference->selfReference->title}',
    )
  })

  it('handles array fields with multiple types', () => {
    const schema = Schema.compile({
      name: 'default',
      types: [
        {
          name: 'test',
          type: 'document',
          fields: [
            {
              name: 'content',
              type: 'array',
              of: [
                {
                  type: 'object',
                  fields: [{name: 'text', type: 'string'}],
                },
                {
                  type: 'reference',
                  to: [{type: 'other'}],
                },
              ],
            },
          ],
          preview: {
            select: {
              title: 'content.0.text',
              subtitle: 'content.0.name',
            },
          },
        },
        {
          name: 'other',
          type: 'document',
          fields: [{name: 'name', type: 'string'}],
        },
      ],
    })

    expect(getProjectionForSchemaType(schema, 'test')).toBe(
      '{"title":content[0].text,"subtitle":content[0]->name}',
    )
  })

  it('handles deeply nested objects with arrays and references', () => {
    const schema = Schema.compile({
      name: 'default',
      types: [
        {
          name: 'test',
          type: 'document',
          fields: [
            {
              name: 'nested',
              type: 'object',
              fields: [
                {
                  name: 'array',
                  type: 'array',
                  of: [
                    {
                      type: 'object',
                      fields: [
                        {
                          name: 'reference',
                          type: 'reference',
                          to: [{type: 'target'}],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
          preview: {
            select: {
              title: 'nested.array.0.reference.title',
            },
          },
        },
        {
          name: 'target',
          type: 'document',
          fields: [{name: 'title', type: 'string'}],
        },
      ],
    })

    expect(getProjectionForSchemaType(schema, 'test')).toBe(
      '{"title":nested.array[0].reference->title}',
    )
  })

  it('handles multiple possible paths via coalesce for mixed reference types', () => {
    const schema = Schema.compile({
      name: 'default',
      types: [
        {
          name: 'test',
          type: 'document',
          fields: [
            {
              name: 'link',
              type: 'reference',
              to: [{type: 'person'}, {type: 'company'}],
            },
          ],
          preview: {
            select: {
              title: 'link.ambiguous.displayName', // both person and company have displayName but in different structures
            },
          },
        },
        {
          name: 'person',
          type: 'document',
          fields: [
            {
              name: 'displayName',
              type: 'string',
            },
            {
              name: 'ambiguous',
              type: 'object',
              fields: [{name: 'displayName', type: 'string'}],
            },
          ],
        },
        {
          name: 'company',
          type: 'document',
          fields: [
            {
              name: 'ambiguous',
              type: 'reference',
              to: [{type: 'person'}],
            },
          ],
        },
      ],
    })

    expect(getProjectionForSchemaType(schema, 'test')).toBe(
      '{"title":coalesce(link->ambiguous.displayName,link->ambiguous->displayName)}',
    )
  })
})
