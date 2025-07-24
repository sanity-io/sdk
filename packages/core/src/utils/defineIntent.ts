/**
 * Filter criteria for intent matching. Can be combined to create more specific intents.
 *
 * @example
 * ```typescript
 * // matches only geopoints in the travel-project project, production dataset
 * const filter: IntentFilter = {
 *   projectId: 'travel-project',
 *   dataset: 'production',
 *   types: ['geopoint']
 * }
 *
 * // matches all documents in the travel-project project
 * const filter: IntentFilter = {
 *   projectId: 'travel-project',
 *   types: ['*']
 * }
 *
 * // matches geopoints in the travel-project production dataset and map pins in all projects in the org
 * const filters: IntentFilter[] = [
 *  {
 *    projectId: 'travel-project',
 *    dataset: 'production',
 *    types: ['geopoint']
 *  },
 *  {
 *    types: ['map-pin']
 *  }
 * ]
 * ```
 * @public
 */
export interface IntentFilter {
  /**
   * Project ID to match against
   * @remarks When specified, the intent will only match for the specified project.
   */
  projectId?: string

  /**
   * Dataset to match against
   * @remarks When specified, the intent will only match for the specified dataset. Requires projectId to be specified.
   */
  dataset?: string

  /**
   * Document types that this intent can handle
   * @remarks This is required for all filters. Use ['*'] to match all document types.
   */
  types: string[]
}

/**
 * Intent definition structure for registering user intents
 * @public
 */
export interface Intent {
  /**
   * Unique identifier for this intent
   * @remarks Should be unique across all registered intents in an org for proper matching
   */
  id: string

  /**
   * The action that this intent performs
   * @remarks Examples: "view", "edit", "create", "delete"
   */
  action: 'view' | 'edit' | 'create' | 'delete'

  /**
   * Human-readable title for this intent
   * @remarks Used for display purposes in UI or logs
   */
  title: string

  /**
   * Detailed description of what this intent does
   * @remarks Helps users understand the purpose and behavior of the intent
   */
  description?: string

  /**
   * Array of filter criteria for intent matching
   * @remarks At least one filter is required. Use `{types: ['*']}` to match everything
   */
  filters: IntentFilter[]
}

/**
 * Creates a properly typed intent definition for registration with the backend.
 *
 * This utility function provides TypeScript support and validation for intent declarations.
 * It is also used in the CLI if intents are declared as bare objects in an intents file.
 *
 * @param intent - The intent definition object
 * @returns The same intent object with proper typing
 *
 * @example
 * ```typescript
 * // Specific filter for a document type
 * const viewGeopointInMapApp = defineIntent({
 *   id: 'viewGeopointInMapApp',
 *   action: 'view',
 *   title: 'View a geopoint in the map app',
 *   description: 'This lets you view a geopoint in the map app',
 *   filters: [
 *     {
 *       projectId: 'travel-project',
 *       dataset: 'production',
 *       types: ['geopoint']
 *     }
 *   ]
 * })
 *
 * export default viewGeopointInMapApp
 * ```
 *
 * If your intent is asynchronous, resolve the promise before defining / returning the intent
 * ```typescript
 * async function createAsyncIntent() {
 *   const currentProject = await asyncProjectFunction()
 *   const currentDataset = await asyncDatasetFunction()
 *
 *   return defineIntent({
 *     id: 'dynamicIntent',
 *     action: 'view',
 *     title: 'Dynamic Intent',
 *     description: 'Intent with dynamically resolved values',
 *     filters: [
 *       {
 *         projectId: currentProject,  // Resolved value
 *         dataset: currentDataset,    // Resolved value
 *         types: ['document']
 *       }
 *     ]
 *   })
 * }
 *
 * const intent = await createAsyncIntent()
 * export default intent
 * ```
 *
 * @public
 */
export function defineIntent(intent: Intent): Intent {
  // Validate required fields
  if (!intent.id) {
    throw new Error('Intent must have an id')
  }
  if (!intent.action) {
    throw new Error('Intent must have an action')
  }
  if (!intent.title) {
    throw new Error('Intent must have a title')
  }
  if (!Array.isArray(intent.filters)) {
    throw new Error('Intent must have a filters array')
  }
  if (intent.filters.length === 0) {
    throw new Error(
      "Intent must have at least one filter. If you want to match everything, use {types: ['*']}",
    )
  }

  // Validate each filter
  intent.filters.forEach((filter, index) => {
    validateFilter(filter, index)
  })

  // Return the intent as-is, providing type safety and runtime validation
  return intent
}

/**
 * Validates an individual filter object
 * @param filter - The filter to validate
 * @param index - The filter's index in the array (for error messages)
 * @internal
 */
function validateFilter(filter: IntentFilter, index: number): void {
  const filterContext = `Filter at index ${index}`

  // Check that filter is an object
  if (!filter || typeof filter !== 'object') {
    throw new Error(`${filterContext} must be an object`)
  }

  // Check that types is required
  if (filter.types === undefined) {
    throw new Error(
      `${filterContext} must have a types property. Use ['*'] to match all document types.`,
    )
  }

  // Validate projectId
  if (filter.projectId !== undefined) {
    if (typeof filter.projectId !== 'string') {
      throw new Error(`${filterContext}: projectId must be a string`)
    }
    if (filter.projectId.trim() === '') {
      throw new Error(`${filterContext}: projectId cannot be empty`)
    }
  }

  // Validate dataset
  if (filter.dataset !== undefined) {
    if (typeof filter.dataset !== 'string') {
      throw new Error(`${filterContext}: dataset must be a string`)
    }
    if (filter.dataset.trim() === '') {
      throw new Error(`${filterContext}: dataset cannot be empty`)
    }
    // Dataset requires projectId to be specified
    if (filter.projectId === undefined) {
      throw new Error(`${filterContext}: dataset cannot be specified without projectId`)
    }
  }

  // Validate types (now required)
  if (!Array.isArray(filter.types)) {
    throw new Error(`${filterContext}: types must be an array`)
  }
  if (filter.types.length === 0) {
    throw new Error(`${filterContext}: types array cannot be empty`)
  }

  // Validate each type
  filter.types.forEach((type, typeIndex) => {
    if (typeof type !== 'string') {
      throw new Error(`${filterContext}: types[${typeIndex}] must be a string`)
    }
    if (type.trim() === '') {
      throw new Error(`${filterContext}: types[${typeIndex}] cannot be empty`)
    }
  })

  // Check for wildcard exclusivity
  const hasWildcard = filter.types.includes('*')
  if (hasWildcard && filter.types.length > 1) {
    throw new Error(
      `${filterContext}: when using wildcard '*', it must be the only type in the array`,
    )
  }
}
