export * from './sdk-react.ts'
export * from '@sanity/sdk'

// Explicitly re-export React-layer handle types to resolve ambiguity with @sanity/sdk versions.
// These shadow the core (strict) versions for @sanity/sdk-react consumers.
export {type DocumentHandle, type DocumentTypeHandle, type ResourceHandle} from './sdk-react.ts'
