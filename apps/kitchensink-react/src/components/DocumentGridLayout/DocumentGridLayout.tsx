import {Grid} from '@sanity/ui'
import {type PropsWithChildren, type ReactElement} from 'react'

const listReset = {listStyle: 'none', margin: 0, padding: 0} as const

/**
 * @public
 */
export const DocumentGridLayout = (props: PropsWithChildren): ReactElement => {
  return (
    <Grid
      as="ol"
      className="DocumentGridLayout"
      gap={3}
      gridTemplateColumns={[1, 2, 3]}
      style={listReset}
    >
      {props.children}
    </Grid>
  )
}

DocumentGridLayout.displayName = 'DocumentGridLayout'
