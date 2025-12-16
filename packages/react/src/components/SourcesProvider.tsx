import {type DocumentSource} from '@sanity/sdk'
import {type ReactNode, useContext} from 'react'

import {SourcesContext} from '../context/SourcesContext'

export function SourcesProvider({
  children,
  sources,
}: {
  sources: Record<string, DocumentSource>
  children: ReactNode
}): ReactNode {
  const parent = useContext(SourcesContext)

  return (
    <SourcesContext.Provider value={{...parent, ...sources}}>{children}</SourcesContext.Provider>
  )
}
