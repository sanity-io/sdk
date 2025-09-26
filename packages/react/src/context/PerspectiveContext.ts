import {type PerspectiveHandle} from '@sanity/sdk'
import {createContext} from 'react'

export const PerspectiveContext = createContext<PerspectiveHandle['perspective']>(undefined)
