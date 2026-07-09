import {Card, CardProps} from '@sanity/ui'
import {CSSProperties, forwardRef, JSX, PropsWithChildren, Ref} from 'react'

const trStyle = {display: 'table-row'} as const
const tdStyle = {display: 'table-cell'} as const
const thStyle = {display: 'table-cell', textAlign: 'left'} as const
const tableStyle = {
  display: 'table',
  borderCollapse: 'collapse',
  width: '100%',
} as const

export const TR = forwardRef(function TableRow(
  props: PropsWithChildren<CardProps>,
  ref: Ref<HTMLTableRowElement>,
): JSX.Element {
  const {children, ...rest} = props
  return (
    <Card {...rest} style={trStyle} as="tr" ref={ref}>
      {children}
    </Card>
  )
})

export const TD = forwardRef(function TableCell(
  props: PropsWithChildren<CardProps>,
  ref: Ref<HTMLTableCellElement>,
): JSX.Element {
  const {children, ...rest} = props
  return (
    <Card {...rest} style={tdStyle} as="td" ref={ref}>
      {children}
    </Card>
  )
})

export const TH = forwardRef(function TableHeaderCell(
  props: PropsWithChildren<CardProps>,
  ref: Ref<HTMLTableCellElement>,
): JSX.Element {
  const {children, ...rest} = props
  return (
    <Card {...rest} style={thStyle} as="th" ref={ref}>
      {children}
    </Card>
  )
})

export const Table = forwardRef(function TableRoot(
  props: PropsWithChildren<CardProps & {style?: CSSProperties}>,
  ref: Ref<HTMLTableElement>,
): JSX.Element {
  const {children, style, ...rest} = props
  return (
    <Card {...rest} style={{...tableStyle, ...style}} as="table" ref={ref}>
      {children}
    </Card>
  )
})
