import {type ReleasePerspective} from '@sanity/sdk'
import {type PerspectiveHandle} from '@sanity/sdk-react'

export const isReleasePerspective = (
  perspective: PerspectiveHandle['perspective'],
): perspective is ReleasePerspective => {
  return typeof perspective === 'object' && perspective !== null && 'releaseName' in perspective
}
