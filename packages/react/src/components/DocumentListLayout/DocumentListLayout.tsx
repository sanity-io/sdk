import '../../css/styles.css'

import type {PropsWithChildren, ReactElement} from 'react'

/**
 * @public
 */
export const DocumentListLayout = (props: PropsWithChildren): ReactElement => {
  return <ol className="DocumentListLayout list-none">{props.children}</ol>
}

DocumentListLayout.displayName = 'DocumentListLayout'
