import {type PerspectiveHandle, type ReleasePerspective} from '../../config/sanityConfig'

export function isReleasePerspective(
  perspective: PerspectiveHandle['perspective'],
): perspective is ReleasePerspective {
  return typeof perspective === 'object' && perspective !== null && 'releaseName' in perspective
}
