import type {ReactElement} from 'react'
import styled from 'styled-components'

/**
 * @public
 */
export interface LayoutTwoColumnCollapseProps {
  /** Content for the first column */
  first: React.ReactNode
  /** Content for the second column */
  second: React.ReactNode
}

const Container = styled.div`
  display: grid;
  width: 100%;
  height: 100%;
  grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
`

const Column = styled.div`
  height: 100%;
`

/**
 * A responsive two-column layout component that collapses to single column below 680px
 * @public
 * @param {LayoutTwoColumnCollapseProps} props - The props for the LayoutTwoColumnCollapse component
 * @param {ReactNode} props.first - Content for the first column
 * @param {ReactNode} props.second - Content for the second column
 * @returns {ReactElement} The LayoutTwoColumnCollapse component
 */
export function LayoutTwoColumnCollapse({
  first,
  second,
}: LayoutTwoColumnCollapseProps): ReactElement {
  return (
    <Container data-ui="LayoutTwoColumnCollapse">
      <Column data-ui="LayoutTwoColumnCollapse:First">{first}</Column>
      <Column data-ui="LayoutTwoColumnCollapse:Second">{second}</Column>
    </Container>
  )
}

LayoutTwoColumnCollapse.displayName = 'LayoutTwoColumnCollapse'
