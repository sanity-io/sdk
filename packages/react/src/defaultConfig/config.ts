import {author} from './schemas/author'
import {book} from './schemas/book'

export const config = {
  projectId: 'ppsg7ml5',
  dataset: 'test',
  schemaTypes: [book, author],
  // TODO: more elegant handling of env vars
  // @ts-expect-error
  token: import.meta.env['SANITY_TOKEN']!,
  apiVersion: '2024-10-25',
}
