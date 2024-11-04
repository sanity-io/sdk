import type {SanityClient} from '@sanity/client'
import type {Observable} from 'rxjs'

/**
 * Login methods that may be used for Studio authentication.
 *
 * @public
 */
export type LoginMethod = 'dual' | 'cookie' | 'token'

/**
 * Authentication options
 *
 * @public
 */
export interface AuthConfig {
  /**
   * Login method to use for the studio. Can be one of:
   * - `dual` (default) - attempt to use cookies where possible, falling back to
   *   storing authentication token in `localStorage` otherwise
   * - `cookie` - explicitly disable `localStorage` method, relying only on cookies. May fail due
   *   to cookies being treated as third-party cookies in some browsers, thus the default is `dual`.
   * - `token` - explicitly disable cookies, relying only on `localStorage` method
   */
  loginMethod?: LoginMethod

  /**
   * Whether to append the providers specified in `providers` with the default providers from the
   * API, or replace the default providers with the ones specified.
   *
   * @deprecated Use the function form of `providers` instead for more control
   */
  mode?: 'append' | 'replace'

  /**
   * If true, the "Choose login provider" (eg "Google, "GitHub", "E-mail/password") screen
   * will be skipped if only a single provider is configured in the `providers` array -
   * instead it will redirect unauthenticated users straight to the authentication URL.
   */
  redirectOnSingle?: boolean

  /**
   * Array of authentication providers to use, or a function that takes an array of default
   * authentication providers (fetched from the Sanity API) and should return a new list of
   * providers. This can be used to selectively replace, add or remove providers from the
   * list of choices.
   *
   * @remarks If a static array of providers is provided, the `mode` property is taken into account
   *   when determining what to do with it - `append` will append the providers to the default set
   *   of providers, while `replace` will replace the default providers with the ones specified.
   *
   * If not set, the default providers will be used.
   */
  providers?: AuthProvider[] | ((prev: AuthProvider[]) => AuthProvider[] | Promise<AuthProvider[]>)

  /**
   * The API hostname for requests. Should usually be left undefined,
   * but can be set if using custom cname for API domain.
   */
  apiHost?: string
}

/** @internal */
export interface AuthProvider {
  /**
   * URL-friendly identifier/name for the provider, eg `github`
   */
  name: string

  /**
   * Human friendly title for the provider, eg `GitHub`
   */
  title: string

  /**
   * URL for the authentication endpoint that will trigger the authentication flow
   */
  url: string

  /**
   * URL for a logo to display next to the provider in the login screen
   */
  logo?: string
}

/** @internal */
export interface AuthStoreOptions extends AuthConfig {
  projectId: string
  dataset: string
  mode?: 'append' | 'replace'
  redirectOnSingle?: boolean
  providers?: AuthProvider[] | ((prev: AuthProvider[]) => AuthProvider[] | Promise<AuthProvider[]>)
}

/**
 * The interface used by the Studio that produces a `SanityClient` and
 * `CurrentUser` that gets passed to the resulting `Workspace`s and `Source`s.
 *
 * NOTE: This interface is primarily for internal use. Refer to
 * `createAuthStore` instead.
 *
 * @beta
 * @hidden
 */
export interface AuthStore {
  /**
   * Emits `AuthState`s. This should update when the user's auth state changes.
   * E.g. After a login, a new `AuthState` could be emitted with a non-null
   * `currentUser` and `authenticated: true`
   *
   * NOTE: all auth store implementations should emit on subscribe using
   * something like shareReplay(1) to ensure all new subscribers get an
   * `AuthState` value on subscribe
   */
  state: Observable<AuthState>
  /**
   * Emits auth tokens, or `null` if not configured to use them or they do not exist
   */
  token?: Observable<string | null>
  /**
   * Custom auth stores can implement a function that runs when the user logs
   * out. The implementation is expected to remove all credentials both locally
   * and on the server.
   */
  logout?: () => void
  /**
   * Custom auth stores can implement a function that is designated to run when
   * the Studio loads (e.g. to trade a session ID for a token in cookie-less
   * mode). Within the Studio, this is called within the `AuthBoundary`.
   */
  handleCallbackUrl?: () => Promise<void>
}

/**
 * The unit an `AuthStore` emits to determine the user's authentication state.
 *
 * @beta
 * @hidden
 */
export interface AuthState {
  /**
   * Similar to a logged-in flag. This state is used in places like the
   * `AuthBoundary` to determine whether or not it should render the
   * `NotAuthenticatedComponent`. Implementers may choose to set this to `true`
   * while also also emitting a `currentUser` of `null` if a `null` user is
   * accepted (e.g. a project that doesn't require a login)
   */
  authenticated: boolean
  /**
   * The value of the user logged in or `null` if none is provided
   */
  currentUser: CurrentUser | null
  /**
   * A client that is expected to be pre-configured to allow for any downstream
   * requests in the Studio
   */
  client: SanityClient
}

/** @public */
export interface CurrentUser {
  id: string
  name: string
  email: string
  profileImage?: string
  provider?: string
  /** @deprecated use `roles` instead */
  role: string
  roles: Role[]
}

/** @public */
export interface Role {
  name: string
  title: string
  description?: string
}

/**
 * @beta
 * @hidden
 */
export type LoginComponentProps =
  | {
      projectId: string
      /** @deprecated use redirectPath instead */
      basePath: string
      redirectPath?: string
    }
  | {
      projectId: string
      redirectPath: string
      /** @deprecated use redirectPath instead */
      basePath?: string
    }
