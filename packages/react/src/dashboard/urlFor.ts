/** @public */
export interface Url {
  url(options?: {origin?: string}): string
  toURL(options: {origin: string}): URL
  toString(): string
}

// URL requires an origin; public output always strips this parsing base.
const relativeUrlBase = 'https://dashboard.invalid'

/** @public */
export interface EditIntentParameters {
  id: string
  /** The document schema type, for example `post`. */
  type?: string
  /** Requests a Studio edit mode, such as `structure` or `presentation`. */
  mode?: 'structure' | 'presentation' | (string & Record<never, never>)
}

/** @public */
export interface CreateIntentParameters {
  template: string
  type: string
}

/** @public */
export interface ReleaseIntentParameters {
  id: string
}

/** @public */
export interface StudioWorkspaceUrl extends Url {
  intent(intent: 'edit', parameters: EditIntentParameters): StudioIntentUrl
  intent(intent: 'create', parameters: CreateIntentParameters): StudioIntentUrl
  intent(intent: 'release', parameters: ReleaseIntentParameters): StudioIntentUrl
  path(...path: string[]): Url
  task(taskId: string): Url
}

/** @public */
export interface StudioUrl extends StudioWorkspaceUrl {
  workspace(workspace: string): StudioWorkspaceUrl
}

/** @public */
export interface StudioIntentUrl extends Url {
  perspective(perspective: string): StudioIntentUrl
  comment(commentId: string): StudioIntentUrl
  task(taskId: string): Url
}

/** @public */
export interface CoreApplicationUrl extends Url {
  path(...path: string[]): Url
}

/** @public */
export interface MediaLibraryUrl extends Url {
  asset(assetId: string): Url
  collection(collectionId: string): Url
}

/** @public */
export interface CanvasUrl extends Url {
  document(documentId: string): Url
}

type IntentArguments =
  | [intent: 'edit', parameters: EditIntentParameters]
  | [intent: 'create', parameters: CreateIntentParameters]
  | [intent: 'release', parameters: ReleaseIntentParameters]

type BuilderRegistry = Readonly<
  Record<
    string,
    {
      readonly namespace: string
      new (url: URL): UrlBuilder
    }
  >
>

type BuilderMethods<Builders extends BuilderRegistry> = {
  readonly [Name in keyof Builders]: () => InstanceType<Builders[Name]>
}

const splitPath = (path: readonly string[]) =>
  path.flatMap((part) => part.split('/')).filter(Boolean)

const intentParametersOf = (...[intent, parameters]: IntentArguments) => {
  const searchParameters = new URLSearchParams()

  switch (intent) {
    case 'edit': {
      const {id, type, mode} = parameters
      searchParameters.set('id', id)
      if (type !== undefined) searchParameters.set('type', type)
      if (mode !== undefined) searchParameters.set('mode', mode)
      break
    }
    case 'create': {
      searchParameters.set('template', parameters.template)
      searchParameters.set('type', parameters.type)
      break
    }
    case 'release': {
      searchParameters.set('id', parameters.id)
      break
    }
  }

  return searchParameters
}

const parseIntentParameters = (parameters: string) =>
  new URLSearchParams(parameters.replaceAll(';', '&'))

const serializeIntentParameters = (parameters: URLSearchParams) =>
  Array.from(
    parameters,
    ([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(value)}`,
  ).join(';')

const appendSegments = (url: URL, segments: readonly string[]): URL => {
  const nextUrl = new URL(url)
  if (segments.length === 0) return nextUrl

  nextUrl.pathname = `${nextUrl.pathname.replace(/\/$/, '')}/${segments
    .map(encodeURIComponent)
    .join('/')}`
  return nextUrl
}

/**
 * Base class for immutable URL grammars.
 *
 * @public
 */
export class UrlBuilder implements Url {
  readonly #url: URL

  /**
   * Creates an immutable URL builder at the supplied URL.
   *
   * @example
   * ```ts
   * const builder = new UrlBuilder(
   *   new URL('/application/my-app', 'https://dashboard.sanity.io'),
   * )
   *
   * builder.url() // '/application/my-app'
   * ```
   */
  constructor(url: URL) {
    this.#url = new URL(url)
  }

  /**
   * Returns a builder with each value appended as one encoded path segment.
   *
   * Route literals and identifiers can be passed together. A slash inside a value stays within
   * that segment instead of creating another route level.
   *
   * @example
   * ```ts
   * class DocumentUrlBuilder extends UrlBuilder {
   *   document(documentId: string) {
   *     return this.append('documents', documentId)
   *   }
   * }
   *
   * const builder = new DocumentUrlBuilder(new URL('https://dashboard.sanity.io'))
   * builder.document('drafts/document-1').url()
   * // '/documents/drafts%2Fdocument-1'
   * ```
   */
  protected append(...segments: string[]): this {
    return this.#create(appendSegments(this.#url, segments))
  }

  /**
   * Returns a builder with changes made through the platform `URL` API.
   *
   * This supports URL details outside the path grammar, including search parameters and hashes.
   *
   * @example
   * ```ts
   * class DocumentUrlBuilder extends UrlBuilder {
   *   perspective(name: string) {
   *     return this.edit((url) => url.searchParams.set('perspective', name))
   *   }
   *
   *   panel(panelId: string) {
   *     return this.edit((url) => {
   *       url.hash = `panel/${panelId}`
   *     })
   *   }
   * }
   * ```
   */
  protected edit(update: (url: URL) => void): this {
    const url = new URL(this.#url)
    update(url)
    return this.#create(url)
  }

  /**
   * Returns another builder type rooted at the appended path segments.
   *
   * Use this inside a custom builder method only when its route enters a child grammar with
   * different methods; use `append` when chaining stays on the current grammar.
   *
   * @example
   * ```ts
   * class DocumentUrlBuilder extends UrlBuilder {
   *   perspective(name: string) {
   *     return this.edit((url) => url.searchParams.set('perspective', name))
   *   }
   * }
   *
   * class ApplicationUrlBuilder extends UrlBuilder {
   *   document(documentId: string) {
   *     return this.transitionTo(DocumentUrlBuilder, 'documents', documentId)
   *   }
   * }
   *
   * const builder = new ApplicationUrlBuilder(new URL('https://dashboard.sanity.io'))
   * builder.document('document-1').perspective('published').url()
   * // '/documents/document-1?perspective=published'
   * ```
   */
  protected transitionTo<Builder extends UrlBuilder>(
    Builder: new (url: URL) => Builder,
    ...segments: string[]
  ): Builder {
    return new Builder(appendSegments(this.#url, segments))
  }

  /**
   * Returns the URL as a relative string by default.
   *
   * Supplying an origin returns an absolute URL string for the same dashboard route.
   *
   * @example
   * ```ts
   * const builder = new UrlBuilder(
   *   new URL('/application/my-app', 'https://dashboard.sanity.io'),
   * )
   *
   * builder.url() // '/application/my-app'
   * builder.url({origin: 'https://dashboard.sanity.io'})
   * // 'https://dashboard.sanity.io/application/my-app'
   * ```
   */
  url(options?: {origin?: string}): string {
    const relativeUrl = this.#relativeUrl()
    return options?.origin === undefined ? relativeUrl : new URL(relativeUrl, options.origin).href
  }

  /**
   * Returns the URL as a platform `URL` object using the supplied origin.
   *
   * @example
   * ```ts
   * const builder = new UrlBuilder(
   *   new URL('/application/my-app', 'https://dashboard.sanity.io'),
   * )
   *
   * builder.toURL({origin: 'https://dashboard.sanity.io'}).pathname
   * // '/application/my-app'
   * ```
   */
  toURL({origin}: {origin: string}): URL {
    return new URL(this.#relativeUrl(), origin)
  }

  /**
   * Returns the same relative URL as {@link UrlBuilder.url}.
   *
   * @example
   * ```ts
   * const builder = new UrlBuilder(
   *   new URL('/application/my-app', 'https://dashboard.sanity.io'),
   * )
   *
   * `${builder}` // '/application/my-app'
   * ```
   */
  toString(): string {
    return this.url()
  }

  #relativeUrl(): string {
    return `${this.#url.pathname}${this.#url.search}${this.#url.hash}`
  }

  #create(url: URL): this {
    const Builder = this.constructor as new (url: URL) => this
    return new Builder(url)
  }
}

class CoreApplicationUrlBuilder extends UrlBuilder implements CoreApplicationUrl {
  static readonly namespace = 'application'

  path(...path: string[]): this {
    return this.append(...splitPath(path))
  }
}

class MediaLibraryUrlBuilder extends UrlBuilder implements MediaLibraryUrl {
  static readonly namespace = 'media'

  asset(assetId: string): Url {
    return this.append('assets', assetId)
  }

  collection(collectionId: string): Url {
    return this.append('collections', collectionId)
  }
}

class CanvasUrlBuilder extends UrlBuilder implements CanvasUrl {
  static readonly namespace = 'canvas'

  document(documentId: string): Url {
    return this.append('doc', documentId)
  }
}

class StudioUrlBuilder
  extends UrlBuilder
  implements StudioUrl, StudioWorkspaceUrl, StudioIntentUrl
{
  static readonly namespace = 'studios'

  workspace(workspace: string): StudioWorkspaceUrl {
    return this.append(workspace)
  }

  intent(intent: 'edit', parameters: EditIntentParameters): StudioIntentUrl
  intent(intent: 'create', parameters: CreateIntentParameters): StudioIntentUrl
  intent(intent: 'release', parameters: ReleaseIntentParameters): StudioIntentUrl
  intent(...args: IntentArguments): StudioIntentUrl {
    return this.append('intent', args[0]).edit((url) => {
      url.pathname = `${url.pathname}/${serializeIntentParameters(intentParametersOf(...args))}/`
    })
  }

  perspective(perspective: string): StudioIntentUrl {
    return this.edit((url) => url.searchParams.set('perspective', perspective))
  }

  comment(commentId: string): StudioIntentUrl {
    return this.edit((url) => {
      const segments = url.pathname.split('/')
      const parametersIndex = segments.length - 2
      const parameters = parseIntentParameters(segments[parametersIndex]!)
      parameters.set('inspect', 'sanity/comments')
      parameters.set('comment', commentId)
      segments[parametersIndex] = serializeIntentParameters(parameters)
      url.pathname = segments.join('/')
    })
  }

  task(taskId: string): Url {
    return this.edit((url) => url.searchParams.set('selectedTask', taskId))
  }

  path(...path: string[]): Url {
    return this.append(...splitPath(path))
  }
}

/** @public */
export interface Urls {
  studios(): Url
  studios(appId: string): StudioUrl
  applications(): Url
  applications(appId: string): CoreApplicationUrl
  mediaLibrary(): MediaLibraryUrl
  canvas(): CanvasUrl
  home(): Url
  extend<
    const Builders extends Readonly<
      Record<
        string,
        {
          readonly namespace: string
          new (url: URL): UrlBuilder
        }
      >
    >,
  >(
    builders: Builders & Partial<Record<keyof this, never>>,
  ): this & {readonly [Name in keyof Builders]: () => InstanceType<Builders[Name]>}
}

const createRootBuilder = <Builder extends UrlBuilder>(
  Builder: (new (url: URL) => Builder) & {readonly namespace: string},
  ...segments: string[]
): Builder =>
  new Builder(appendSegments(new URL(relativeUrlBase), [Builder.namespace, ...segments]))

const createUrls = <const Builders extends BuilderRegistry>(
  builders: Builders,
): Urls & BuilderMethods<Builders> => {
  function studios(): Url
  function studios(appId: string): StudioUrl
  function studios(appId?: string): Url | StudioUrl {
    return appId === undefined
      ? createRootBuilder(StudioUrlBuilder)
      : createRootBuilder(StudioUrlBuilder, appId)
  }

  function applications(): Url
  function applications(appId: string): CoreApplicationUrl
  function applications(appId?: string): Url | CoreApplicationUrl {
    return appId === undefined
      ? new UrlBuilder(new URL('/applications', relativeUrlBase))
      : createRootBuilder(CoreApplicationUrlBuilder, appId)
  }

  const methods = Object.fromEntries(
    Object.entries(builders).map(([name, Builder]) => [name, () => createRootBuilder(Builder)]),
  )

  const urls = {
    studios,
    applications,
    mediaLibrary: () => createRootBuilder(MediaLibraryUrlBuilder),
    canvas: () => createRootBuilder(CanvasUrlBuilder),
    home: () => new UrlBuilder(new URL(relativeUrlBase)),
    extend<const AddedBuilders extends BuilderRegistry>(addedBuilders: AddedBuilders) {
      const namespaces = new Set([
        '',
        'applications',
        StudioUrlBuilder.namespace,
        CoreApplicationUrlBuilder.namespace,
        MediaLibraryUrlBuilder.namespace,
        CanvasUrlBuilder.namespace,
        ...Object.values(builders).map((Builder) => Builder.namespace),
      ])

      for (const [name, Builder] of Object.entries(addedBuilders)) {
        if (name in urls || name in methods) {
          throw new Error(`URL builder "${name}" already exists`)
        }
        if (namespaces.has(Builder.namespace)) {
          throw new Error(`URL namespace "${Builder.namespace}" already exists`)
        }
        namespaces.add(Builder.namespace)
      }

      return createUrls({...builders, ...addedBuilders})
    },
  }

  return Object.assign(urls, methods) as Urls & BuilderMethods<Builders>
}

/** @public */
export const urlFor: Urls = createUrls({})
