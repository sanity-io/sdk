import {type SanityInstance} from '@sanity/sdk'
import {createContext} from 'react'

export const SanityInstanceContext = createContext<SanityInstance[] | null>(null)
