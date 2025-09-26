import {type DocumentSource} from '@sanity/sdk'
import {createContext} from 'react'

export const DefaultSourceContext = createContext<DocumentSource | null>(null)
