import {Stack} from '@sanity/ui'
import type {PropsWithChildren, ReactElement} from 'react'

/**
 * @public
 */
export const DocumentListLayout = (props: PropsWithChildren): ReactElement => {
  return (
    <Stack as="ol" data-ui="DocumentListLayout">
      {props.children}
    </Stack>
  )
}

DocumentListLayout.displayName = 'DocumentListLayout'
