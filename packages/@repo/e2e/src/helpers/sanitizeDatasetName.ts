import {deburr} from 'lodash-es'

// we need to make a valid name for a sanity dataset from inputs
// (people may have odd characters in branch names, etc)
export function sanitizeDatasetName(input: string): string {
  return deburr(input)
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^-/, '')
}
