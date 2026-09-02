import {type PropsWithChildren, type ReactElement} from 'react'
import {Grid} from 'ui5'

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
      gridTemplateColumns={['1fr', 'repeat(2, minmax(0, 1fr))', 'repeat(3, minmax(0, 1fr))']}
      style={listReset}
    >
      {props.children}
    </Grid>
  )
}

DocumentGridLayout.displayName = 'DocumentGridLayout'
