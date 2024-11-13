import type {SanityInstance} from '../instance/types'

/** @public */
export interface DocumentOptions {
  type: string
  filter: string
}

/** @public */
export interface GetDocumentsResult {
  documents: {id: string; title: string; subtitle: string; media: string}[]
  isLoading: boolean
}

/**
 * Retrieve a memoized client based on the apiVersion.
 * @public
 */
export const getDocuments = async (
  options: DocumentOptions,
  instance: SanityInstance,
): Promise<GetDocumentsResult> => {
  // eslint-disable-next-line no-console
  console.log('getDocuments', instance)
  const type = options.type
  const filter = options.filter

  const fakeData = {
    books: [
      {
        id: '1',
        title: 'Book 1',
        subtitle: 'Subtitle 1',
        media: 'Media 1',
      },
      {
        id: '2',
        title: 'Book 2',
        subtitle: 'Subtitle 2',
        media: 'Media 2',
      },
    ],
    movies: [
      {
        id: '1',
        title: 'Movie 1',
        subtitle: 'Subtitle 1',
        media: 'Media 1',
      },
      {
        id: '2',
        title: 'Movie 2',
        subtitle: 'Subtitle 2',
        media: 'Media 2',
      },
    ],
    music: [
      {
        id: '1',
        title: 'Music 1',
        subtitle: 'Subtitle 1',
        media: 'Media 1',
      },
    ],
  }
  const documents = fakeData[type as keyof typeof fakeData].filter((doc) =>
    doc.title.includes(filter),
  )

  return await Promise.resolve({
    documents,
    isLoading: false,
  })
}
