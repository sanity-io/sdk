import {type ReleaseDocument} from '@sanity/client'

// mirrors the order of the releases in the releases list in Studio
// https://github.com/sanity-io/sanity/blob/main/packages/sanity/src/core/releases/hooks/utils.ts
export function sortReleases(releases: ReleaseDocument[] = []): ReleaseDocument[] {
  // The order should always be:
  // [undecided (sortByCreatedAt), scheduled(sortBy publishAt || metadata.intendedPublishAt), asap(sortByCreatedAt)]
  return [...releases].sort((a, b) => {
    // metadata is optional on a release document; guard against releases that
    // have no metadata at all so sorting can't throw and wipe out the list.
    const aType = a.metadata?.releaseType
    const bType = b.metadata?.releaseType

    // undecided are always first, then by createdAt descending
    if (aType === 'undecided' && bType !== 'undecided') {
      return -1
    }
    if (aType !== 'undecided' && bType === 'undecided') {
      return 1
    }
    if (aType === 'undecided' && bType === 'undecided') {
      // Sort by createdAt
      return new Date(b._createdAt).getTime() - new Date(a._createdAt).getTime()
    }

    // Scheduled are always at the middle, then by publishAt descending
    if (aType === 'scheduled' && bType === 'scheduled') {
      const aPublishAt = a['publishAt'] || a.metadata?.['intendedPublishAt']
      if (!aPublishAt) {
        return 1
      }
      const bPublishAt = b['publishAt'] || b.metadata?.['intendedPublishAt']
      if (!bPublishAt) {
        return -1
      }
      return new Date(bPublishAt).getTime() - new Date(aPublishAt).getTime()
    }

    // ASAP are always last, then by createdAt descending
    if (aType === 'asap' && bType !== 'asap') {
      return 1
    }
    if (aType !== 'asap' && bType === 'asap') {
      return -1
    }
    if (aType === 'asap' && bType === 'asap') {
      // Sort by createdAt
      return new Date(b._createdAt).getTime() - new Date(a._createdAt).getTime()
    }

    return 0
  })
}
