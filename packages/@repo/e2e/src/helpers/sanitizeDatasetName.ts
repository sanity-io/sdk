// we need to make a valid name for a sanity dataset from inputs
// (people may have odd characters in branch names, etc)
export function sanitizeDatasetName(input: string): string {
  return input
    .normalize('NFD')
    .replaceAll(/\p{Mn}/gu, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^-/, '')
}
