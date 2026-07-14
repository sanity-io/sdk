import {createContext} from 'react'

/**
 * Carries a `projectId` for a subtree even when a complete
 * `DatasetResource` can't be formed — e.g. a `<ResourceProvider projectId="…">`
 * with no `dataset` and no parent resource to inherit one from.
 *
 * Project-scoped hooks (`useProject`, `useDatasets`, `useUsers`) read this as a
 * fallback so they can still resolve a project in that case (the only hooks that would work with a config like this.)
 *
 * @remarks Temporary bridge for the dataset-less project scope.
 * Remove in the next major version; those hooks should just always use a projectId or default to a resource available.
 * @internal
 */
export const ProjectContext = createContext<string | undefined>(undefined)
