// Auth
export {useAuthState} from '../hooks/auth/useAuthState'
export {useAuthToken} from '../hooks/auth/useAuthToken'
export {useCurrentUser} from '../hooks/auth/useCurrentUser'
export {useHandleCallback} from '../hooks/auth/useHandleCallback'
export {useLoginUrls} from '../hooks/auth/useLoginUrls'
export {useLogOut} from '../hooks/auth/useLogOut'

// Client
export {useClient} from '../hooks/client/useClient'

// Comlink
export {
  type FrameConnection,
  type FrameMessageHandler as MessageHandler,
  useFrameConnection,
  type UseFrameConnectionOptions,
} from '../hooks/comlink/useFrameConnection'
export {
  useWindowConnection,
  type UseWindowConnectionOptions,
  type WindowConnection,
  type WindowMessageHandler,
} from '../hooks/comlink/useWindowConnection'

// Context
export {useSanityInstance} from '../hooks/context/useSanityInstance'

// Documents
export {type DocumentCollection, useDocuments} from '../hooks/documentCollection/useDocuments'
export {
  usePreview,
  type UsePreviewOptions,
  type UsePreviewResults,
} from '../hooks/preview/usePreview'

// Users
export {type CurrentUser} from '@sanity/sdk'

// Permissions
export {useHasPermission} from '../hooks/permissions/useHasPermission'
export {useHasPermissionCategory} from '../hooks/permissions/useHasPermissionCategory'
export {useHasPermissionForResource} from '../hooks/permissions/useHasPermissionForResource'
export {usePermissions} from '../hooks/permissions/usePermissions'
export {usePermissionsByAction} from '../hooks/permissions/usePermissionsByAction'
export {usePermissionsByResource} from '../hooks/permissions/usePermissionsByResource'
export {usePermissionsByType} from '../hooks/permissions/usePermissionsByType'
export {usePermissionsForResource} from '../hooks/permissions/usePermissionsForResource'
export {usePermissionsResourceTypes} from '../hooks/permissions/usePermissionsResourceTypes'
export {type Permission} from '@sanity/sdk'
