import {type AppFunctionContract} from '@sanity/sdk/_internal'
import {createContext} from 'react'

/** Function stack binding supplied by the CLI-generated app entry. @internal */
export interface AppFunctionsConfig {
  /** Generated client contracts, supplied by the CLI. */
  functions?: Record<string, AppFunctionContract>
  stackId: string
  organizationId: string
}

/** App-local defaults for authenticated function clients. @internal */
export const AppFunctionsContext = createContext<AppFunctionsConfig | undefined>(undefined)
