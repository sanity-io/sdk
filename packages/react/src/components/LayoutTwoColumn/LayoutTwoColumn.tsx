import type {ReactElement} from 'react'
import styled from 'styled-components'

/**
 * @public
 */
export interface LayoutTwoColumnProps {
  /** Content for the first column */
  first: React.ReactNode
  /** Content for the second column */
  second: React.ReactNode
}

const Container = styled.div`
  display: grid;
  width: 100%;
  height: 100%;
  grid-template-columns: 1fr 1fr;
`

const Column = styled.div`
  height: 100%;
`

/**
 * A simple two-column layout component with equal width columns
 * @public
 * @param {LayoutTwoColumnProps} props - The props for the LayoutTwoColumn component
 * @param {ReactNode} props.first - Content for the left column
 * @param {ReactNode} props.second - Content for the right column
 * @returns {ReactElement} The LayoutTwoColumn component
 */
export function LayoutTwoColumn({first, second}: LayoutTwoColumnProps): ReactElement {
  return (
    <Container data-ui="LayoutTwoColumn">
      <Column data-ui="LayoutTwoColumn:First">{first}</Column>
      <Column data-ui="LayoutTwoColumn:Second">{second}</Column>
    </Container>
  )
}

LayoutTwoColumn.displayName = 'LayoutTwoColumn'
