import {useContext} from 'react'
import {type Schema} from 'sanity'

import {SDKContext} from '../../context/ExampleContext'

export function useSchema(): Schema {
  const context = useContext(SDKContext)
  if (context === undefined) {
    throw new Error('useSchema must be used within a SDKPreviewProvider')
  }
  return context.schema
}
