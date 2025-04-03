import {type ValidProjection} from './projectionStore'

export const PROJECTION_TAG = 'sdk.projection'
export const PROJECTION_PERSPECTIVE = 'drafts'
export const PROJECTION_STATE_CLEAR_DELAY = 1000

export const STABLE_EMPTY_PROJECTION = {
  data: null,
  isPending: false,
}

export function validateProjection(projection: string): ValidProjection {
  if (!projection.startsWith('{') || !projection.endsWith('}')) {
    throw new Error(
      `Invalid projection format: "${projection}". Projections must be enclosed in curly braces, e.g. "{title, 'author': author.name}"`,
    )
  }
  return projection as ValidProjection
}
