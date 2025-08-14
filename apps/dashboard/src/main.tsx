import {StrictMode} from 'react'
import {createRoot} from 'react-dom/client'

import App from './App'

// Initialize SharedWorker for subscription management
async function initializeSharedWorker() {
  try {
    // Import the worker from the SDK package using the proper export
    const workerUrl = new URL('@sanity/sdk/worker?worker&url', import.meta.url).href

    // Create SharedWorker
    const worker = new SharedWorker(workerUrl, {
      type: 'module',
    })

    // Set up connection
    worker.port.onmessage = (event) => {
      const {type, data} = event.data

      if (type === 'welcome') {
        console.log('SharedWorker connected successfully')
      } else {
        console.log('SharedWorker message:', type, data)
      }
    }

    // Start the port
    worker.port.start()

    // Store worker instance globally for use in components
    ;(window as any).subscriptionWorker = worker

    console.log('SharedWorker initialized successfully')
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
