import {type AuthConfig, type DocumentResource} from '@sanity/sdk'

// True when running against the e2e environment. The SANITY_APP_E2E_* vars are
// auto-exposed on import.meta.env by the App SDK's Vite config (SANITY_APP_ prefix).
export const isE2E = !!import.meta.env['SANITY_APP_E2E_MODE']

// True when the app is the top-level window rather than embedded in the Dashboard
// iframe. Webkit/Safari runs the e2e suite standalone (it can't execute scripts in
// the Dashboard's sandboxed iframe), while chromium/firefox run inside the Dashboard.
const isStandalone = window.self === window.top

// Opt into the OAuth (PKCE) login flow locally by setting SANITY_APP_OAUTH_CLIENT_ID in
// `.env.local`. Register `http://localhost:<port>/` as the redirect URI on that client.
// Unset, the app uses the standalone `sanity.io/login` flow.
const oauthClientId = import.meta.env['SANITY_APP_OAUTH_CLIENT_ID']
export const devAuth: AuthConfig = oauthClientId
  ? {
      oauth: {
        clientId: oauthClientId,
        organizationId: 'oblZgbTFj',
        redirectUri: `${window.location.origin}/`,
      },
    }
  : {}

export const devResources: Record<string, DocumentResource> = {
  default: {
    projectId: 'ppsg7ml5',
    dataset: 'test',
  },
  secondary: {
    projectId: 'vo1ysemo',
    dataset: 'production',
  },
}

export const e2eResources: Record<string, DocumentResource> = {
  default: {
    projectId: import.meta.env['SANITY_APP_E2E_PROJECT_ID'],
    dataset: import.meta.env['SANITY_APP_E2E_DATASET_0'],
  },
  secondary: {
    projectId: import.meta.env['SANITY_APP_E2E_PROJECT_ID'],
    dataset: import.meta.env['SANITY_APP_E2E_DATASET_1'],
  },
  // Standalone runs (webkit/Safari) have no Dashboard org context, so `inferMediaLibraryAndCanvas`
  // can't resolve anything — provide the media library and canvas resources explicitly.
  // Otherewise, omit these so we can ensure that inferMediaLibraryAndCanvas is e2e tested.
  ...(isStandalone && {
    'media-library': {mediaLibraryId: import.meta.env['SANITY_APP_E2E_MEDIA_LIBRARY_ID']},
    'canvas': {canvasId: import.meta.env['SANITY_APP_E2E_CANVAS_ID']},
  }),
}
