import {type MultipleMutationResult, type SanityDocumentStub} from '@sanity/client'
import {uuid} from '@sanity/uuid'

import {getClient} from './clients'
import {getE2EEnv} from './getE2EEnv'

const env = getE2EEnv()

export type DocumentStub = Omit<SanityDocumentStub, '_id'> & {_id?: string}

// Keep track of document IDs created during tests
const documentIds = new Set<string>()

function getUniqueDocumentId(): string {
  const documentId = uuid()
  documentIds.add(documentId)
  return documentId
}

export async function createDocuments<T extends DocumentStub>(
  data: T[],
  options?: {asDraft?: boolean},
  dataset?: string,
): Promise<MultipleMutationResult & {documentIds: string[]}> {
  const client = getClient(dataset)
  const asDraft = options?.asDraft ?? true // Default to draft if not specified

  const createdIds: string[] = []
  const docs = data.map((doc) => {
    // Use provided _id if available, otherwise generate a new one
    const documentId = doc._id || getUniqueDocumentId()
    if (doc._id) {
      // Track custom IDs for cleanup
      documentIds.add(documentId)
    }
    createdIds.push(documentId)

    return {
      ...doc,
      _type: doc['_type'],
      _id: asDraft ? `drafts.${documentId}` : documentId,
    }
  })

  const transaction = client.transaction()
  docs.forEach((doc) => transaction.create(doc))
  const result = await transaction.commit({visibility: 'sync'})

  return {
    ...result,
    documentIds: createdIds,
  }
}

export async function cleanupDocuments(): Promise<void> {
  if (documentIds.size === 0) return

  // Clean up documents in both datasets
  await Promise.all(
    [env.SDK_E2E_DATASET_0, env.SDK_E2E_DATASET_1].map(async (dataset) => {
      try {
        const client = getClient(dataset)
        await client.delete({
          query: '*[_id in $ids]',
          params: {ids: [...[...documentIds].map((id) => `drafts.${id}`), ...documentIds]},
        })
      } catch (error) {
        // Log error but don't fail teardown
        // eslint-disable-next-line no-console
        console.error(`Failed to clean up documents in ${dataset}:`, error)
      }
    }),
  )

  documentIds.clear()
}
