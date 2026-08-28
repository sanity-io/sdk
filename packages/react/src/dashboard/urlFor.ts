/** @public */
export interface DashboardUrl {
  url(options?: {absolute?: boolean}): string
  toURL(): URL
  toString(): string
}

/** @public */
export interface DashboardNamespaceUrl extends DashboardUrl {
  path(...path: string[]): DashboardNamespaceUrl
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

/** @public */
export interface MediaLibraryUrl extends DashboardUrl {
  asset(assetId: string): DashboardUrl
  collection(collectionId: string): DashboardUrl
}

/** @public */
export interface CanvasUrl extends DashboardUrl {
  document(documentId: string): DashboardUrl
}

/** @public */
export interface DashboardUrls {
  studios(): DashboardUrl
  studios(appId: string): StudioUrl
  applications(): DashboardUrl
  applications(appId: string): DashboardUrl
  mediaLibrary(): MediaLibraryUrl
  canvas(): CanvasUrl
  home(): DashboardUrl
  extend<const Namespaces extends Readonly<Record<string, string>>>(
    namespaces: Namespaces & Partial<Record<keyof this, never>>,
  ): this & {readonly [Name in keyof Namespaces]: () => DashboardNamespaceUrl}
}

type DashboardUrlNamespaceMethods<Namespaces extends Readonly<Record<string, string>>> = {
  readonly [Name in keyof Namespaces]: () => DashboardNamespaceUrl
}

type IntentArguments =
  | [intent: 'edit', parameters: EditIntentParameters]
  | [intent: 'create', parameters: CreateIntentParameters]
  | [intent: 'release', parameters: ReleaseIntentParameters]

type Parameter = readonly [name: string, value: string]

type Intent = {name: string; parameters: readonly Parameter[]}

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

const serializeParameters = (parameters: readonly Parameter[]) =>
  parameters.map(([name, value]) => `${name}=${encodeURIComponent(value)}`).join(';')

type BuilderState = {
  segments: readonly string[]
  intent: Intent | null
  search: readonly Parameter[]
}

class UrlBuilder
  implements
    StudioUrl,
    StudioWorkspaceUrl,
    StudioIntentUrl,
    MediaLibraryUrl,
    CanvasUrl,
    DashboardNamespaceUrl
{
  readonly #state: BuilderState

  constructor(state: BuilderState) {
    this.#state = state
  }

  workspace(workspace: string): StudioWorkspaceUrl {
    return this.#append(workspace)
  }

  intent(intent: 'edit', parameters: EditIntentParameters): StudioIntentUrl
  intent(intent: 'create', parameters: CreateIntentParameters): StudioIntentUrl
  intent(intent: 'release', parameters: ReleaseIntentParameters): StudioIntentUrl
  intent(...args: IntentArguments): StudioIntentUrl {
    return this.#with({intent: {name: args[0], parameters: intentParametersOf(...args)}})
  }

  perspective(perspective: string): StudioIntentUrl {
    return this.#withSearchParameter('perspective', perspective)
  }

  comment(commentId: string): StudioIntentUrl {
    const intent = this.#state.intent!

    return this.#with({
      intent: {
        ...intent,
        parameters: [
          ...intent.parameters.filter(([name]) => name !== 'inspect' && name !== 'comment'),
          ['inspect', 'sanity/comments'],
          ['comment', commentId],
        ],
      },
    })
  }

  task(taskId: string): DashboardUrl {
    return this.#withSearchParameter('selectedTask', taskId)
  }

  path(...path: string[]): DashboardNamespaceUrl {
    return this.#append(...splitPath(path))
  }

  asset(assetId: string): DashboardUrl {
    return this.#append('assets', assetId)
  }

  collection(collectionId: string): DashboardUrl {
    return this.#append('collections', collectionId)
  }

  document(documentId: string): DashboardUrl {
    return this.#append('doc', documentId)
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

  #append(...segments: string[]): UrlBuilder {
    return this.#with({segments: [...this.#state.segments, ...segments]})
  }

  #withSearchParameter(name: string, value: string): UrlBuilder {
    return this.#with({
      search: [...this.#state.search.filter(([current]) => current !== name), [name, value]],
    })
  }

  #with(state: Partial<BuilderState>): UrlBuilder {
    return new UrlBuilder({...this.#state, ...state})
  }

  #pathname(): string {
    const {segments, intent} = this.#state
    const base = `/${segments.map(encodeURIComponent).join('/')}`
    if (!intent) return base
    return `${base}/intent/${intent.name}/${serializeParameters(intent.parameters)}/`
  }

  #relativeUrl(): string {
    const {search} = this.#state
    if (search.length === 0) return this.#pathname()

    const parameters = new URLSearchParams(search.map(([name, value]) => [name, value]))
    return `${this.#pathname()}?${parameters.toString()}`
  }
}

const builder = (...segments: string[]) => new UrlBuilder({segments, intent: null, search: []})

const createDashboardUrls = <const Namespaces extends Readonly<Record<string, string>>>(
  createBuilder: typeof builder,
  namespaces: Namespaces,
): DashboardUrls & DashboardUrlNamespaceMethods<Namespaces> => {
  const rootedAt = (root: string) => (appId?: string) =>
    appId === undefined ? createBuilder(root) : createBuilder(root, appId)

  function studios(): DashboardUrl
  function studios(appId: string): StudioUrl
  function studios(appId?: string): DashboardUrl | StudioUrl {
    return rootedAt('studio')(appId)
  }

  function applications(): DashboardUrl
  function applications(appId: string): DashboardUrl
  function applications(appId?: string): DashboardUrl {
    return rootedAt('application')(appId)
  }

  const methods = Object.fromEntries(
    Object.entries(namespaces).map(([name, namespace]) => [name, () => createBuilder(namespace)]),
  )

  const dashboardUrls = {
    studios,
    applications,
    mediaLibrary: () => createBuilder('media'),
    canvas: () => createBuilder('canvas'),
    home: () => createBuilder(),
    extend<const AddedNamespaces extends Readonly<Record<string, string>>>(
      addedNamespaces: AddedNamespaces,
    ) {
      for (const name of Object.keys(addedNamespaces)) {
        if (name in dashboardUrls || name in methods) {
          throw new Error(`Dashboard URL namespace "${name}" already exists`)
        }
      }

      return createDashboardUrls(createBuilder, {...namespaces, ...addedNamespaces})
    },
  }

  return Object.assign(dashboardUrls, methods) as DashboardUrls &
    DashboardUrlNamespaceMethods<Namespaces>
}

/** @public */
export const urlFor: DashboardUrls = createDashboardUrls(builder, {})
