import {type SdkResource} from './types'

/**
 * thoughtLevel 2 - Primarily what we want is to have an object that we can bind stores/memoizations to, but let the things that depend on it (eg projectId, dataset) be internals that can't be overwritten by accident/intentionally
 * @public
 */
export function getSdkResources(resources: SdkResource[]): readonly SdkResource[] {
  return Object.freeze(
    resources?.map<SdkResource>(({projectId, dataset}) => {
      return {
        id: generateId(),
        resourceId: `${projectId}:${dataset}`,
        projectId,
        dataset,
      }
    }),
  )
}

function generateId() {
  return Array.from({length: 8}, () =>
    Math.floor(Math.random() * 16)
      .toString(16)
      .padStart(2, '0'),
  ).join('')
}
