/** @public */
export interface DashboardUrl {
  url(options?: {absolute?: boolean}): string
  toURL(): URL
  toString(): string
}

const dashboardUrlBuilderContext = Symbol('DashboardUrlBuilderContext')

/** @public */
export interface DashboardUrlBuilderContext {
  readonly [dashboardUrlBuilderContext]: true
}

/** @public */
export interface DashboardUrlBuilderClass<
  Builder extends DashboardUrlBuilder = DashboardUrlBuilder,
> {
  new (context: DashboardUrlBuilderContext): Builder
}

/** @public */
export interface DashboardUrlBuilderNamespaceClass<
  Builder extends DashboardUrlBuilder = DashboardUrlBuilder,
> extends DashboardUrlBuilderClass<Builder> {
  readonly namespace: string
}

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

type IntentArguments =
  | [intent: 'edit', parameters: EditIntentParameters]
  | [intent: 'create', parameters: CreateIntentParameters]
  | [intent: 'release', parameters: ReleaseIntentParameters]

type Parameter = readonly [name: string, value: string]

type PathSegment = {raw: boolean; value: string}

type BuilderState = {
  segments: readonly PathSegment[]
  search: readonly Parameter[]
  trailingSlash: boolean
}

type InternalBuilderContext = DashboardUrlBuilderContext & {
  create: (state: BuilderState) => DashboardUrlBuilder
  state: BuilderState
}

type BuilderRegistry = Readonly<Record<string, DashboardUrlBuilderNamespaceClass>>

type BuilderMethods<Builders extends BuilderRegistry> = {
  readonly [Name in keyof Builders]: () => InstanceType<Builders[Name]>
}

const splitPath = (path: readonly string[]) =>
  path.flatMap((part) => part.split('/')).filter(Boolean)

const intentParametersOf = (...[intent, parameters]: IntentArguments) => {
  switch (intent) {
    case 'edit': {
      const {id, type, mode} = parameters
      return [
        ['id', id],
        ...(type === undefined ? [] : ([['type', type]] satisfies Parameter[])),
        ...(mode === undefined ? [] : ([['mode', mode]] satisfies Parameter[])),
      ] satisfies Parameter[]
    }
    case 'create':
      return [
        ['template', parameters.template],
        ['type', parameters.type],
      ] satisfies Parameter[]
    case 'release':
      return [['id', parameters.id]] satisfies Parameter[]
  }
}

const parseParameters = (parameters: string): Parameter[] =>
  parameters.split(';').map((parameter) => {
    const separator = parameter.indexOf('=')
    return [parameter.slice(0, separator), decodeURIComponent(parameter.slice(separator + 1))]
  })

const serializeParameters = (parameters: readonly Parameter[]) =>
  parameters.map(([name, value]) => `${name}=${encodeURIComponent(value)}`).join(';')

const appendSegments = (
  state: BuilderState,
  segments: readonly string[],
  raw: boolean,
): BuilderState => ({
  ...state,
  segments: [...state.segments, ...segments.map((value) => ({raw, value}))],
  trailingSlash: false,
})

const createBuilder = <Builder extends DashboardUrlBuilder>(
  Builder: DashboardUrlBuilderClass<Builder>,
  state: BuilderState,
): Builder => {
  const context: InternalBuilderContext = {
    [dashboardUrlBuilderContext]: true,
    create: (nextState) => createBuilder(Builder, nextState),
    state,
  }

  return new Builder(context)
}

/**
 * Base class for immutable dashboard URL grammars.
 *
 * @public
 */
export abstract class DashboardUrlBuilder implements DashboardUrl {
  readonly #create: (state: BuilderState) => this
  readonly #state: BuilderState

  constructor(context: DashboardUrlBuilderContext) {
    const {create, state} = context as InternalBuilderContext
    this.#create = create as (nextState: BuilderState) => this
    this.#state = state
  }

  protected append(...segments: string[]): this {
    return this.#create(appendSegments(this.#state, segments, false))
  }

  protected appendPath(...path: string[]): this {
    return this.append(...splitPath(path))
  }

  protected appendRaw(segment: string): this {
    return this.#create(appendSegments(this.#state, [segment], true))
  }

  protected lastSegment(): string | undefined {
    return this.#state.segments.at(-1)?.value
  }

  protected replaceLastRawSegment(segment: string): this {
    return this.#create({
      ...this.#state,
      segments: [...this.#state.segments.slice(0, -1), {raw: true, value: segment}],
    })
  }

  protected setSearchParameter(name: string, value: string): this {
    return this.#create({
      ...this.#state,
      search: [...this.#state.search.filter(([current]) => current !== name), [name, value]],
    })
  }

  protected trailingSlash(): this {
    return this.#create({...this.#state, trailingSlash: true})
  }

  protected transition<Builder extends DashboardUrlBuilder>(
    Builder: DashboardUrlBuilderClass<Builder>,
    ...segments: string[]
  ): Builder {
    return createBuilder(Builder, appendSegments(this.#state, segments, false))
  }

  url(options?: {absolute?: boolean}): string {
    return options?.absolute ? this.toURL().href : this.#relativeUrl()
  }

  toURL(): URL {
    const origin = globalThis.location?.origin
    if (!origin) {
      throw new Error('Cannot create an absolute dashboard URL without an origin')
    }

    return new URL(this.#relativeUrl(), origin)
  }

  toString(): string {
    return this.url()
  }

  #relativeUrl(): string {
    const {search, segments, trailingSlash} = this.#state
    const pathname = `/${segments
      .map(({raw, value}) => (raw ? value : encodeURIComponent(value)))
      .join('/')}${trailingSlash && segments.length > 0 ? '/' : ''}`
    if (search.length === 0) return pathname

    const parameters = new URLSearchParams(search.map(([name, value]) => [name, value]))
    return `${pathname}?${parameters.toString()}`
  }
}

class TerminalUrlBuilder extends DashboardUrlBuilder {}

/** @public */
export class CoreApplicationUrlBuilder extends DashboardUrlBuilder {
  static readonly namespace = 'application'

  path(...path: string[]): this {
    return this.appendPath(...path)
  }
}

/** @public */
export class MediaLibraryUrlBuilder extends DashboardUrlBuilder {
  static readonly namespace = 'media'

  asset(assetId: string): DashboardUrlBuilder {
    return this.append('assets', assetId)
  }

  collection(collectionId: string): DashboardUrlBuilder {
    return this.append('collections', collectionId)
  }
}

/** @public */
export class CanvasUrlBuilder extends DashboardUrlBuilder {
  static readonly namespace = 'canvas'

  document(documentId: string): DashboardUrlBuilder {
    return this.append('doc', documentId)
  }
}

/** @public */
export class StudioUrlBuilder
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
    return this.append('intent', args[0])
      .appendRaw(serializeParameters(intentParametersOf(...args)))
      .trailingSlash()
  }

  perspective(perspective: string): StudioIntentUrl {
    return this.setSearchParameter('perspective', perspective)
  }

  comment(commentId: string): StudioIntentUrl {
    const parameters = parseParameters(this.lastSegment()!)

    return this.replaceLastRawSegment(
      serializeParameters([
        ...parameters.filter(([name]) => name !== 'inspect' && name !== 'comment'),
        ['inspect', 'sanity/comments'],
        ['comment', commentId],
      ]),
    )
  }

  task(taskId: string): DashboardUrlBuilder {
    return this.setSearchParameter('selectedTask', taskId)
  }

  path(...path: string[]): DashboardUrlBuilder {
    return this.appendPath(...path)
  }
}

/** @public */
export interface DashboardUrls {
  studios(): DashboardUrl
  studios(appId: string): StudioUrl
  applications(): DashboardUrl
  applications(appId: string): CoreApplicationUrlBuilder
  mediaLibrary(): MediaLibraryUrlBuilder
  canvas(): CanvasUrlBuilder
  home(): DashboardUrl
  extend<const Builders extends Readonly<Record<string, DashboardUrlBuilderNamespaceClass>>>(
    builders: Builders & Partial<Record<keyof this, never>>,
  ): this & {readonly [Name in keyof Builders]: () => InstanceType<Builders[Name]>}
}

type RootBuilder = <Builder extends DashboardUrlBuilder>(
  Builder: DashboardUrlBuilderClass<Builder>,
  ...segments: string[]
) => Builder

const builder: RootBuilder = (Builder, ...segments) =>
  createBuilder(Builder, {
    search: [],
    segments: segments.map((value) => ({raw: false, value})),
    trailingSlash: false,
  })

const createDashboardUrls = <const Builders extends BuilderRegistry>(
  createRootBuilder: RootBuilder,
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
  function applications(appId: string): CoreApplicationUrlBuilder
  function applications(appId?: string): DashboardUrl | CoreApplicationUrlBuilder {
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
      for (const name of Object.keys(addedBuilders)) {
        if (name in dashboardUrls || name in methods) {
          throw new Error(`Dashboard URL namespace "${name}" already exists`)
        }
      }

      return createDashboardUrls(createRootBuilder, {...builders, ...addedBuilders})
    },
  }

  return Object.assign(dashboardUrls, methods) as DashboardUrls & BuilderMethods<Builders>
}

/** @public */
export const urlFor: DashboardUrls = createDashboardUrls(builder, {})
