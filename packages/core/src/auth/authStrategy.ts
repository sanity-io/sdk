import {type ClientConfig, type SanityClient} from '@sanity/client'

import {type AuthConfig} from '../config/authConfig'
import {type TokenSource} from '../config/sanityConfig'
import {type AuthMethodOptions, type AuthState, type DashboardContext} from './authStore'

/**
 * The result returned by each auth strategy's `getInitialState` function.
 * Provides the auth store with the initial auth state and the options needed
 * to run the store.
 *
 * @internal
 */
export interface AuthStrategyResult {
  authState: AuthState
  storageKey: string
  storageArea: Storage | undefined
  authMethod: AuthMethodOptions
  dashboardContext: DashboardContext
}

/**
 * Shared options that every auth strategy receives.
 * Extracted from the instance config once and passed through.
 *
 * @internal
 */
export interface AuthStrategyOptions {
  authConfig: AuthConfig
  projectId: string | undefined
  initialLocationHref: string
  clientFactory: (config: ClientConfig) => SanityClient
  /**
   * Reactive token source from a Studio workspace. When provided, the studio
   * auth strategy subscribes to it for ongoing token sync instead of
   * discovering tokens from localStorage or cookies.
   */
  tokenSource?: TokenSource
}
