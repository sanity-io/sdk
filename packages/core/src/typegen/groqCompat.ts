/**
 * Augments `groq` with the type surface of `groq@3.88.1-typegen-experimental.0`, the fork
 * this package depended on before GA `groq`.
 *
 * A `sanity.types.ts` from the experimental Typegen flow imports these helpers from
 * `groq` and augments these interfaces. GA `groq` exports only `defineQuery` and the
 * template tag, so those files stop typechecking without this one.
 *
 * `defineProjection` is absent: it is a runtime function, and declaring it in a
 * type-only augmentation turns a compile error into `undefined is not a function`.
 * `@sanity/sdk` exports it instead.
 *
 * Delete once nothing generates the legacy shape.
 */

// fallow-ignore-file unused-type -- consumers are outside this repo: generated files and
// app code import these from `groq`.
/* eslint-disable @typescript-eslint/no-empty-object-type -- augmentation targets:
   generated files merge entries in, so they stay empty interfaces here. */
declare module 'groq' {
  /**
   * Brands a type with the resource it came from so one flat interface can hold entries
   * from more than one schema; {@link PickSchema} narrows it back out.
   */
  export type SchemaOrigin<TBase, TSchemaId extends string> = TBase & {
    /**
     * @internal
     * @deprecated typescript helper only
     */
    __schemaId?: TSchemaId
  }

  /**
   * Brands a projection result with the document type it was evaluated against;
   * {@link PickProjectionResult} narrows it back out.
   */
  export type ProjectionBase<TBase, TProjectionBaseTypeName extends string> = TBase & {
    /**
     * @internal
     * @deprecated typescript helper only
     */
    __schemaTypeName?: TProjectionBaseTypeName
  }

  /** Extracts the members of `T` that came from the schema `TSchemaId`. */
  export type PickSchema<T, TSchemaId extends string = string> = Extract<
    T,
    SchemaOrigin<T, TSchemaId>
  >

  /** Extracts the members of `T` projected from the document type `TProjectionBaseTypeName`. */
  export type PickProjectionResult<T, TProjectionBaseTypeName extends string = string> = Extract<
    T,
    ProjectionBase<T, TProjectionBaseTypeName>
  >

  /** Augmented by generated files: resource key to the union of that schema's types. */
  export interface SanitySchemas {}

  /** Augmented by generated files: query string to its result type. */
  export interface SanityQueries {}

  /** Augmented by generated files: projection string to its result type. */
  export interface SanityProjections {}

  /**
   * Indexes an augmented interface, falling back to the union of every registered value
   * when the key is absent. Code generated against the fork relies on that fallback, so
   * narrowing it to `never` changes what existing apps infer.
   */
  type SafeAccess<T, K extends string> = K extends keyof T ? T[K] : T[keyof T]

  /** Fields Sanity adds to every document. */
  interface SanityDocumentShape {
    _id: string
    _type: string
    _createdAt: string
    _updatedAt: string
    _rev: string
    [key: string]: unknown
  }

  /** All types registered for one resource. */
  export type SanitySchema<TSchemaId extends string = string> = PickSchema<
    SafeAccess<SanitySchemas, TSchemaId>,
    TSchemaId
  >

  /** One schema type, selected by its `_type` and its resource. */
  export type SanitySchemaType<
    TSchemaTypeName extends string = string,
    TSchemaId extends string = string,
  > = Extract<SanitySchema<TSchemaId>, {_type: TSchemaTypeName}>

  /** One document type, selected by its `_type` and its resource. */
  export type SanityDocument<
    TDocumentType extends string = string,
    TSchemaId extends string = string,
  > = Extract<
    Extract<SanitySchema<TSchemaId>, SanityDocumentShape> | SanityDocumentShape,
    {_type: TDocumentType}
  >

  /** The result of a registered query, for one resource. */
  export type SanityQueryResult<
    TQuery extends string = string,
    TSchemaId extends string = string,
  > = Extract<
    SafeAccess<SanityQueries, TQuery>,
    SchemaOrigin<SafeAccess<SanityQueries, TQuery>, TSchemaId>
  >

  /** The result of a registered projection, for one document type and one resource. */
  export type SanityProjectionResult<
    TProjection extends string = string,
    TProjectionBaseTypeName extends string = string,
    TSchemaId extends string = string,
  > = PickSchema<
    PickProjectionResult<SafeAccess<SanityProjections, TProjection>, TProjectionBaseTypeName>,
    TSchemaId
  >
}

export {}
