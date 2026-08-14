import {Stack} from '@sanity/ui'
import {type PropsWithChildren, type ReactElement} from 'react'

const listReset = {listStyle: 'none', margin: 0, padding: 0} as const

/**
 * @public
 */
export const DocumentListLayout = (props: PropsWithChildren): ReactElement => {
  return (
    <Stack as="ol" className="DocumentListLayout" gap={2} style={listReset}>
      {props.children}
    </Stack>
  )
}

DocumentListLayout.displayName = 'DocumentListLayout'
