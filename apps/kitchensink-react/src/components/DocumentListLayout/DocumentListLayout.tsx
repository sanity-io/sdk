import {type PropsWithChildren, type ReactElement} from 'react'
import {VStack} from 'ui5'

const listReset = {listStyle: 'none'} as const

/**
 * @public
 */
export const DocumentListLayout = (props: PropsWithChildren): ReactElement => {
  return (
    <VStack as="ol" className="DocumentListLayout" gap={2} style={listReset}>
      {props.children}
    </VStack>
  )
}

DocumentListLayout.displayName = 'DocumentListLayout'
