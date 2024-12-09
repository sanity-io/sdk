import type {PropsWithChildren, ReactElement} from 'react'
import styled from 'styled-components'

const DocumentGrid = styled.div`
  display: grid;
  list-style: none;
  margin: unset;
  padding: unset;
  grid-template-columns: repeat(auto-fit, minmax(38ch, 1fr));
`

/**
 * @public
 */
export const DocumentGridLayout = (props: PropsWithChildren): ReactElement => {
  return (
    <DocumentGrid as="ol" data-ui="DocumentGridLayout">
      {props.children}
    </DocumentGrid>
  )
}

DocumentGridLayout.displayName = 'DocumentGridLayout'
