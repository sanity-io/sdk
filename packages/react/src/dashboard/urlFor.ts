/** @public */
export interface DashboardUrl {
  url(options?: {absolute?: boolean}): string
  toURL(): URL
  toString(): string
}

const defaultDashboardOrigin = 'https://dashboard.invalid'

/** @public */
export interface EditIntentParameters {
  id: string
  type?: string
  mode?: string
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
export interface StudioWorkspaceUrl extends DashboardUrl {
  intent(intent: 'edit', parameters: EditIntentParameters): StudioIntentUrl
  intent(intent: 'create', parameters: CreateIntentParameters): StudioIntentUrl
  intent(intent: 'release', parameters: ReleaseIntentParameters): StudioIntentUrl
  path(...path: string[]): DashboardUrl
  task(taskId: string): DashboardUrl
}

/** @public */
export interface StudioUrl extends StudioWorkspaceUrl {
  workspace(workspace: string): StudioWorkspaceUrl
}

/** @public */
export interface StudioIntentUrl extends DashboardUrl {
  perspective(perspective: string): StudioIntentUrl
  comment(commentId: string): StudioIntentUrl
  task(taskId: string): DashboardUrl
}

/** @public */
export interface CoreApplicationUrl extends DashboardUrl {
  path(...path: string[]): DashboardUrl
}

/** @public */
export interface MediaLibraryUrl extends DashboardUrl {
  asset(assetId: string): DashboardUrl
  collection(collectionId: string): DashboardUrl
}

/** @public */
export interface CanvasUrl extends DashboardUrl {
  document(documentId: string): DashboardUrl
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
      new (url: URL): DashboardUrlBuilder
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
 * Base class for immutable dashboard URL grammars.
 *
 * @public
 */
export abstract class DashboardUrlBuilder implements DashboardUrl {
  readonly #url: URL

  constructor(url: URL) {
    this.#url = new URL(url)
  }

  protected append(...segments: string[]): this {
    return this.#create(appendSegments(this.#url, segments))
  }

  protected appendPath(...path: string[]): this {
    return this.append(...splitPath(path))
  }

  protected edit(update: (url: URL) => void): this {
    const url = new URL(this.#url)
    update(url)
    return this.#create(url)
  }

  protected transition<Builder extends DashboardUrlBuilder>(
    Builder: new (url: URL) => Builder,
    ...segments: string[]
  ): Builder {
    return new Builder(appendSegments(this.#url, segments))
  }

  url(options?: {absolute?: boolean}): string {
    return options?.absolute ? this.toURL().href : this.#relativeUrl()
  }

  toURL(): URL {
    const origin =
      this.#url.origin === defaultDashboardOrigin ? globalThis.location?.origin : this.#url.origin
    if (!origin) {
      throw new Error('Cannot create an absolute dashboard URL without an origin')
    }

    return new URL(this.#relativeUrl(), origin)
  }

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

class TerminalUrlBuilder extends DashboardUrlBuilder {}

class CoreApplicationUrlBuilder extends DashboardUrlBuilder implements CoreApplicationUrl {
  static readonly namespace = 'application'

  path(...path: string[]): this {
    return this.appendPath(...path)
  }
}

class MediaLibraryUrlBuilder extends DashboardUrlBuilder implements MediaLibraryUrl {
  static readonly namespace = 'media'

  asset(assetId: string): DashboardUrl {
    return this.append('assets', assetId)
  }

  collection(collectionId: string): DashboardUrl {
    return this.append('collections', collectionId)
  }
}

class CanvasUrlBuilder extends DashboardUrlBuilder implements CanvasUrl {
  static readonly namespace = 'canvas'

  document(documentId: string): DashboardUrl {
    return this.append('doc', documentId)
  }
}

class StudioUrlBuilder
  extends DashboardUrlBuilder
  implements StudioUrl, StudioWorkspaceUrl, StudioIntentUrl
{
  static readonly namespace = 'studio'

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

  task(taskId: string): DashboardUrl {
    return this.edit((url) => url.searchParams.set('selectedTask', taskId))
  }

  path(...path: string[]): DashboardUrl {
    return this.appendPath(...path)
  }
}

/** @public */
export interface DashboardUrls {
  studios(): DashboardUrl
  studios(appId: string): StudioUrl
  applications(): DashboardUrl
  applications(appId: string): CoreApplicationUrl
  mediaLibrary(): MediaLibraryUrl
  canvas(): CanvasUrl
  home(): DashboardUrl
  extend<
    const Builders extends Readonly<
      Record<
        string,
        {
          readonly namespace: string
          new (url: URL): DashboardUrlBuilder
        }
      >
    >,
  >(
    builders: Builders & Partial<Record<keyof this, never>>,
  ): this & {readonly [Name in keyof Builders]: () => InstanceType<Builders[Name]>}
}

const createRootBuilder = <Builder extends DashboardUrlBuilder>(
  Builder: new (url: URL) => Builder,
  ...segments: string[]
): Builder => new Builder(appendSegments(new URL(defaultDashboardOrigin), segments))

const createDashboardUrls = <const Builders extends BuilderRegistry>(
  builders: Builders,
): DashboardUrls & BuilderMethods<Builders> => {
  function studios(): DashboardUrl
  function studios(appId: string): StudioUrl
  function studios(appId?: string): DashboardUrl | StudioUrl {
    return appId === undefined
      ? createRootBuilder(TerminalUrlBuilder, StudioUrlBuilder.namespace)
      : createRootBuilder(StudioUrlBuilder, StudioUrlBuilder.namespace, appId)
  }

  function applications(): DashboardUrl
  function applications(appId: string): CoreApplicationUrl
  function applications(appId?: string): DashboardUrl | CoreApplicationUrl {
    return appId === undefined
      ? createRootBuilder(TerminalUrlBuilder, CoreApplicationUrlBuilder.namespace)
      : createRootBuilder(CoreApplicationUrlBuilder, CoreApplicationUrlBuilder.namespace, appId)
  }

  const methods = Object.fromEntries(
    Object.entries(builders).map(([name, Builder]) => [
      name,
      () => createRootBuilder(Builder, Builder.namespace),
    ]),
  )

  const dashboardUrls = {
    studios,
    applications,
    mediaLibrary: () => createRootBuilder(MediaLibraryUrlBuilder, MediaLibraryUrlBuilder.namespace),
    canvas: () => createRootBuilder(CanvasUrlBuilder, CanvasUrlBuilder.namespace),
    home: () => createRootBuilder(TerminalUrlBuilder),
    extend<const AddedBuilders extends BuilderRegistry>(addedBuilders: AddedBuilders) {
      const namespaces = new Set([
        '',
        StudioUrlBuilder.namespace,
        CoreApplicationUrlBuilder.namespace,
        MediaLibraryUrlBuilder.namespace,
        CanvasUrlBuilder.namespace,
        ...Object.values(builders).map((Builder) => Builder.namespace),
      ])

      for (const [name, Builder] of Object.entries(addedBuilders)) {
        if (name in dashboardUrls || name in methods) {
          throw new Error(`Dashboard URL builder "${name}" already exists`)
        }
        if (namespaces.has(Builder.namespace)) {
          throw new Error(`Dashboard URL namespace "${Builder.namespace}" already exists`)
        }
        namespaces.add(Builder.namespace)
      }

      return createDashboardUrls({...builders, ...addedBuilders})
    },
  }

  return Object.assign(dashboardUrls, methods) as DashboardUrls & BuilderMethods<Builders>
}

/** @public */
export const urlFor: DashboardUrls = createDashboardUrls({})
