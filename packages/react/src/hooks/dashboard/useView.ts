import {useContext} from 'react'

import {getDashboardRootContext, type ViewRootProps} from '../../dashboard/module'

/**
 * Returns the current view.
 *
 * Throws when the component does not render in a Dashboard view.
 *
 * @example
 * ```tsx
 * function ViewTitle() {
 *   const view = useView()
 *   return <h2>{view.title}</h2>
 * }
 * ```
 *
 * @beta
 * @category Dashboard
 */
export function useView(): ViewRootProps['view'] {
  const root = useContext(getDashboardRootContext())

  if (!root?.viewType || !root.props.view) {
    throw new Error('useView must be called inside a Dashboard view')
  }

  return root.props.view
}
