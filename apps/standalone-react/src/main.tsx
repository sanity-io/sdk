import {StrictMode} from 'react'
import {createRoot} from 'react-dom/client'

import App from './App'
import {maybeSeedExpiredTokenFromUrl} from './seedToken'

// Must run before React renders so the SDK picks up any seeded token on init.
maybeSeedExpiredTokenFromUrl()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
