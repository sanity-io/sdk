import {type SanityClient} from '@sanity/client'
import {useContext} from 'react'

import {SDKContext} from '../../context/ExampleContext'

export function useClient(): SanityClient {
  const context = useContext(SDKContext)
  if (context === undefined) {
    throw new Error('useClient must be used within a SDKPreviewProvider')
  }
  return context.client
}
