import {type ReactNode} from 'react'

import {type AppFunctionsConfig, AppFunctionsContext} from './AppFunctionsContext'

export type {AppFunctionsConfig} from './AppFunctionsContext'

/** Props for the CLI's function binding provider. @internal */
export interface AppFunctionsProviderProps {
  value: AppFunctionsConfig
  children: ReactNode
}

/**
 * Provide a function stack to useClient within this application's React tree.
 * Authentication stays with the SDK instance. The CLI supplies stack IDs and contracts.
 * @internal
 */
export function AppFunctionsProvider({value, children}: AppFunctionsProviderProps): ReactNode {
  return <AppFunctionsContext.Provider value={value}>{children}</AppFunctionsContext.Provider>
}
