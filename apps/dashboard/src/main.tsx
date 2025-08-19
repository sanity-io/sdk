import {StrictMode} from 'react'
import {createRoot} from 'react-dom/client'
import {getSdkWorker, addStatusListener, type WorkerStatus} from '@sanity/sdk'
import sdkWorker from '@sanity/sdk/worker?worker&url'

import App from './App'

// Initialize SharedWorker for subscription management
async function initializeSharedWorker() {
  try {
    // Get the SDK worker instance - use direct URL
    const workerUrl = new URL(sdkWorker, import.meta.url).href

    getSdkWorker(workerUrl)

    // Add status listener for debugging
    addStatusListener((status: WorkerStatus) => {
      console.log('[Dashboard] Worker status changed:', status)
    })
  } catch (error) {
    console.warn('Failed to initialize SharedWorker:', error)
    // Fallback to local subscription management
  }
}

// Initialize SharedWorker when the app starts
initializeSharedWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
