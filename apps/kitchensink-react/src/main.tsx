import {addStatusListener, getSdkWorker, type WorkerStatus} from '@sanity/sdk-react'
import sdkWorker from '@sanity/sdk-react/worker'
import {StrictMode} from 'react'
import {createRoot} from 'react-dom/client'

import App from './App'

// eslint-disable-next-line no-console
console.log('[Kitchensink] main.tsx loaded')

// Initialize SharedWorker for subscription management
async function initializeSharedWorker() {
  try {
    // eslint-disable-next-line no-console
    console.log('[Kitchensink] initializeSharedWorker() called')

    // eslint-disable-next-line no-console
    console.log('[Kitchensink] sdkWorker import value:', sdkWorker)

    // Get the SDK worker instance - use direct URL
    const workerUrl = new URL(sdkWorker, import.meta.url).href

    // eslint-disable-next-line no-console
    console.log('[Kitchensink] Resolved worker URL:', workerUrl)

    const {status: initialStatus} = getSdkWorker(workerUrl)

    // eslint-disable-next-line no-console
    console.log('[Kitchensink] getSdkWorker() returned initial status:', initialStatus)

    // Add status listener for debugging
    addStatusListener((status: WorkerStatus) => {
      // eslint-disable-next-line no-console
      console.log('[Kitchensink] Worker status changed:', status)
    })
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('Failed to initialize SharedWorker:', error)
    // Fallback to local subscription management
  }
}

// Initialize SharedWorker when the app starts
// eslint-disable-next-line no-console
console.log('[Kitchensink] Initializing SharedWorker...')
initializeSharedWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
