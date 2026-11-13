import {type ApplicationInterface} from '@sanity/sdk'
import {useContext} from 'react'

import {getDashboardRootContext} from '../../dashboard/module'

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
 * @public
 * @category Dashboard
 */
export function useView(): Extract<ApplicationInterface, {type: 'panel' | 'tile'}> {
  const root = useContext(getDashboardRootContext())

  if ((root?.viewType !== 'panel' && root?.viewType !== 'tile') || !root.props.view) {
    throw new Error('useView must be called inside a Dashboard view')
  }

  return root.props.view
}
