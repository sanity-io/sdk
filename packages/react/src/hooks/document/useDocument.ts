import {type DocumentOptions, getDocumentState, type JsonMatch} from '@sanity/sdk'
import {type SanityDocument} from 'groq'
import {useMemo} from 'react'

import {type SourceOptions} from '../../type'
import {useSanityInstanceAndSource} from '../context/useSanityInstance'
import {useStoreState} from '../helpers/useStoreState'
// used in an `{@link useDocumentProjection}` and `{@link useQuery}`
// eslint-disable-next-line import/consistent-type-specifier-style, unused-imports/no-unused-imports
import type {useDocumentProjection} from '../projection/useDocumentProjection'
// eslint-disable-next-line import/consistent-type-specifier-style, unused-imports/no-unused-imports
import type {useQuery} from '../query/useQuery'

export interface UseDocumentOptions<
  TPath extends string | undefined = undefined,
  TDocumentType extends string = string,
> extends Omit<DocumentOptions<TPath, TDocumentType>, 'source'>,
    SourceOptions {}

interface UseDocument {
  /** @internal */
  <TDocumentType extends string, TDataset extends string, TProjectId extends string = string>(
    options: UseDocumentOptions<undefined, TDocumentType>,
  ): {data: SanityDocument<TDocumentType, `${TProjectId}.${TDataset}`> | null}

  /** @internal */
  <
    TPath extends string,
    TDocumentType extends string,
    TDataset extends string = string,
    TProjectId extends string = string,
  >(
    options: UseDocumentOptions<TPath, TDocumentType>,
  ): {
    data: JsonMatch<SanityDocument<TDocumentType, `${TProjectId}.${TDataset}`>, TPath> | undefined
  }

  /** @internal */
  <TData>(options: DocumentOptions<undefined>): {data: TData | null}
  /** @internal */
  <TData>(options: DocumentOptions<string>): {data: TData | undefined}

  /**
   * ## useDocument via Type Inference (Recommended)
   *
   * @public
   *
   * The preferred way to use this hook when working with Sanity Typegen.
   *
   * Features:
   * - Automatically infers document types from your schema
   * - Provides type-safe access to documents and nested fields
   * - Supports project/dataset-specific type inference
   * - Works seamlessly with Typegen-generated types
   *
   * This hook will suspend while the document data is being fetched and loaded.
   *
   * When fetching a full document:
   * - Returns the complete document object if it exists
   * - Returns `null` if the document doesn't exist
   *
   * When fetching with a path:
   * - Returns the value at the specified path if both the document and path exist
   * - Returns `undefined` if either the document doesn't exist or the path doesn't exist in the document
   *
   * @category Documents
   * @param options - Configuration including `documentId`, `documentType`, and optionally:
   *   - `path`: To select a nested value (returns typed value at path)
   *   - `projectId`/`dataset`: For multi-project/dataset setups
   * @returns The document state (or nested value if path provided).
   *
   * @example Basic document fetch
   * ```tsx
   * import {useDocument, type DocumentHandle} from '@sanity/sdk-react'
   *
   * interface ProductViewProps {
   *   doc: DocumentHandle<'product'> // Typegen infers product type
   * }
   *
   * function ProductView({doc}: ProductViewProps) {
   *   const {data: product} = useDocument({...doc}) // Fully typed product
   *   return <h1>{product.title ?? 'Untitled'}</h1>
   * }
   * ```
   *
   * @example Fetching a specific field
   * ```tsx
   * import {useDocument, type DocumentHandle} from '@sanity/sdk-react'
   *
   * interface ProductTitleProps {
   *   doc: DocumentHandle<'product'>
   * }
   *
   * function ProductTitle({doc}: ProductTitleProps) {
   *   const {data: title} = useDocument({
   *     ...doc,
   *     path: 'title' // Returns just the title field
   *   })
   *   return <h1>{title ?? 'Untitled'}</h1>
   * }
   * ```
   *
   * @inlineType DocumentOptions
   */
  <
    TPath extends string | undefined = undefined,
    TDocumentType extends string = string,
    TDataset extends string = string,
    TProjectId extends string = string,
  >(
    options: UseDocumentOptions<TPath, TDocumentType>,
  ): TPath extends string
    ? {
        data:
          | JsonMatch<SanityDocument<TDocumentType, `${TProjectId}.${TDataset}`>, TPath>
          | undefined
      }
    : {data: SanityDocument<TDocumentType, `${TProjectId}.${TDataset}`> | null}

  /**
   * @public
   *
   * ## useDocument via Explicit Types
   *
   * Use this version when:
   * - You're not using Sanity Typegen
   * - You need to manually specify document types
   * - You're working with dynamic document types
   *
   * Key differences from Typegen version:
   * - Requires manual type specification via `TData`
   * - Returns `TData | null` for full documents
   * - Returns `TData | undefined` for nested values
   *
   * This hook will suspend while the document data is being fetched.
   *
   * @typeParam TData - The explicit type for the document or field
   * @typeParam TPath - Optional path to a nested value
   * @param options - Configuration including `documentId` and optionally:
   *   - `path`: To select a nested value
   *   - `projectId`/`dataset`: For multi-project/dataset setups
   * @returns The document state (or nested value if path provided)
   *
   * @example Basic document fetch with explicit type
   * ```tsx
   * import {useDocument, type DocumentHandle, type SanityDocument} from '@sanity/sdk-react'
   *
   * interface Book extends SanityDocument {
   *   _type: 'book'
   *   title: string
   *   author: string
   * }
   *
   * interface BookViewProps {
   *   doc: DocumentHandle
   * }
   *
   * function BookView({doc}: BookViewProps) {
   *   const {data: book} = useDocument<Book>({...doc})
   *   return <h1>{book?.title ?? 'Untitled'} by {book?.author ?? 'Unknown'}</h1>
   * }
   * ```
   *
   * @example Fetching a specific field with explicit type
   * ```tsx
   * import {useDocument, type DocumentHandle} from '@sanity/sdk-react'
   *
   * interface BookTitleProps {
   *   doc: DocumentHandle
   * }
   *
   * function BookTitle({doc}: BookTitleProps) {
   *   const {data: title} = useDocument<string>({...doc, path: 'title'})
   *   return <h1>{title ?? 'Untitled'}</h1>
   * }
   * ```
   *
   * @inlineType DocumentOptions
   */
  <TData, TPath extends string>(
    options: UseDocumentOptions<TPath>,
  ): TPath extends string ? {data: TData | undefined} : {data: TData | null}

  /**
   * @internal
   */
  (options: UseDocumentOptions): {data: unknown}
}

/**
 * @public
 * Reads and subscribes to a document's realtime state, incorporating both local and remote changes.
 *
 * This hook comes in two main flavors to suit your needs:
 *
 * 1. **[Type Inference](#usedocument-via-type-inference-recommended)** (Recommended) - Automatically gets types from your Sanity schema
 * 2. **[Explicit Types](#usedocument-via-explicit-types)** - Manually specify types when needed
 *
 * @remarks
 * `useDocument` is ideal for realtime editing interfaces where you need immediate feedback on changes.
 * However, it can be resource-intensive since it maintains a realtime connection.
 *
 * For simpler cases where:
 * - You only need to display content
 * - Realtime updates aren't critical
 * - You want better performance
 *
 * …consider using {@link useDocumentProjection} or {@link useQuery} instead. These hooks are more efficient
 * for read-heavy applications.
 *
 * @function
 */
// export const useDocument: UseDocument = wrapHookWithData(useDocumentValue)

export const useDocument = (({projectId, dataset, source, ...options}: UseDocumentOptions) => {
  const [instance, actualSource] = useSanityInstanceAndSource({projectId, dataset, source})

  const state = useMemo(
    () => getDocumentState(instance, {...options, source: actualSource}),
    [actualSource, instance, options],
  )

  const data = useStoreState(state)
  return {data}
}) as UseDocument
