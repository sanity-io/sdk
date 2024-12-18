import type {ReferenceSchemaType, Schema, SchemaType} from '@sanity/types'

export function getProjectionForSchemaType(schema: Schema, schemaTypeName: string): string {
  const schemaType = schema.get(schemaTypeName)
  if (!schemaType) {
    throw new Error(`Could not find type \`${schemaTypeName}\` in the provided schema.`)
  }

  return `{${Object.entries(schemaType.preview?.select ?? {})
    .map(([key, path]) => {
      return `${JSON.stringify(key)}:${getGroqFromPath(schema, schemaType, path)}`
    })
    .join(',')}}`
}

function isReferenceType(
  type: SchemaType | undefined,
  visited = new Set<SchemaType>(),
): type is ReferenceSchemaType {
  if (!type) return false
  if (visited.has(type)) return false
  visited.add(type)

  if (type.name === 'reference') return true
  return isReferenceType(type.type, visited)
}

type PathSegment =
  | {type: 'attribute'; name: string}
  | {type: 'element'; index: number}
  | {type: 'deref'}

function printPath(segments: PathSegment[]): string {
  return segments.reduce((acc, segment) => {
    if (segment.type === 'deref') return `${acc}->`
    if (segment.type === 'element') return `${acc}[${segment.index}]`
    if (acc.endsWith('->')) return `${acc}${segment.name}`
    return [acc, segment.name].filter(Boolean).join('.')
  }, '')
}

const cache = new WeakMap<SchemaType, Map<string, string>>()

function getGroqFromPath(schema: Schema, node: SchemaType, path: string): string {
  const cached = cache.get(node)?.get(path)
  if (cached) return cached

  const possiblePaths = Array.from(
    new Set(resolveAllPaths(schema, node, path.split('.')).map(printPath)),
  )
  if (!possiblePaths.length) {
    // TODO: bubble this instead of warning
    // eslint-disable-next-line no-console
    console.warn(`Could not resolve path \`${path}\` from schema type \`${node.name}\`.`)
    return 'null'
  }

  const result =
    possiblePaths.length === 1 ? possiblePaths[0] : `coalesce(${possiblePaths.join(',')})`

  if (!cache.has(node)) {
    cache.set(node, new Map())
  }
  const mapByPaths = cache.get(node)!
  mapByPaths.set(path, result)

  return result
}

function resolveAllPaths(schema: Schema, schemaType: SchemaType, path: string[]): PathSegment[][] {
  const [name, ...rest] = path
  if (name?.startsWith('_')) {
    return [
      [
        {type: 'attribute', name},
        ...rest.map(
          (next): PathSegment =>
            /\d+/.test(next)
              ? {type: 'element', index: parseInt(next, 10)}
              : {type: 'attribute', name: next},
        ),
      ],
    ]
  } else if (!name) {
    return [[]]
  } else if (isReferenceType(schemaType)) {
    return schemaType.to.flatMap((referenceType) =>
      resolveAllPaths(schema, referenceType, path).map((nextPath): PathSegment[] => [
        {type: 'deref'},
        ...nextPath,
      ]),
    )
  } else if (schemaType.jsonType === 'object') {
    const fieldType = schemaType.fields.find((field) => field.name === name)?.type
    if (!fieldType) return []

    return resolveAllPaths(schema, fieldType, rest).map((nextPath): PathSegment[] => [
      {type: 'attribute', name},
      ...nextPath,
    ])
  } else if (schemaType.jsonType === 'array') {
    const index = parseInt(name, 10)
    return schemaType.of.flatMap((itemType) =>
      resolveAllPaths(schema, itemType, rest).map((nextPath): PathSegment[] => [
        {type: 'element', index},
        ...nextPath,
      ]),
    )
  } else {
    return []
  }
}
