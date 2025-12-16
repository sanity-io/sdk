import {type DocumentSource} from '@sanity/sdk'
import {createContext} from 'react'

export const SourcesContext = createContext<Record<string, DocumentSource>>({})
