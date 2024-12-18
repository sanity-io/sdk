import '../../css/styles.css'

import type {PropsWithChildren, ReactElement} from 'react'

/**
 * @public
 */
export const DocumentGridLayout = (props: PropsWithChildren): ReactElement => {
  return (
    <>
      <style>{`
        .DocumentGridLayout {
          grid-template-columns: repeat(auto-fit, minmax(38ch, 1fr));
        }
      `}</style>
      <ol className="DocumentGridLayout list-none grid">{props.children}</ol>
    </>
  )
}

DocumentGridLayout.displayName = 'DocumentGridLayout'
