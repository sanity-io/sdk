import {DEFAULT_USERS_BATCH_SIZE} from './usersConstants'
import {type UsersWithGrantsOptions} from './usersWithGrants'

/**
 * @internal
 *
 * Spelled out field by field, rather than stringifying the options as given, so
 * the key doesn't change with the key order of a caller's object literal.
 *
 * No instance needed, unlike `getUsersKey`: everything this read resolves comes
 * from the document, so a handle plus the search terms names it completely.
 *
 * Kept apart from the store it keys, because React imports this to memoize and
 * pulling the store in with it would drag the document store and `groq-js` into
 * every bundle that reads a user list.
 */
export const getUsersWithGrantsKey = (options: UsersWithGrantsOptions): string => {
  const {document} = options
  return JSON.stringify({
    batchSize: options.batchSize ?? DEFAULT_USERS_BATCH_SIZE,
    displayName: options.displayName,
    email: options.email,
    sortBy: options.sortBy,
    orderBy: options.orderBy,
    document: {
      documentId: document.documentId,
      documentType: document.documentType,
      projectId: document.projectId,
      dataset: document.dataset,
      resource: document.resource,
      liveEdit: document.liveEdit,
      perspective: document.perspective,
    },
  } satisfies UsersWithGrantsOptions)
}

/** @internal */
export const parseUsersWithGrantsKey = (key: string): UsersWithGrantsOptions =>
  JSON.parse(key) as UsersWithGrantsOptions
