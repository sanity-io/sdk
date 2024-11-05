import config from './config'
import {SanityProvider} from '@sanity/react-sdk'

export function sanityApp() {
  return (
    <SanityProvider config={config}>
      <DocumentList type="Author" />
    </SanityProvider>
  )
}
