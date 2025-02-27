import {Card, CardProps} from '@sanity/ui'
import {JSX, PropsWithChildren} from 'react'

const trStyle = {display: 'table-row'} as const
const tdStyle = {display: 'table-cell'} as const
const thStyle = {display: 'table-cell', textAlign: 'left'} as const
const tableStyle = {
  display: 'table',
  borderCollapse: 'collapse',
  width: '100%',
} as const

export function TR(props: PropsWithChildren<CardProps>): JSX.Element {
  const {children, ...rest} = props
  return (
    <Card {...rest} style={trStyle} as="tr">
      {children}
    </Card>
  )
}

export function TD(props: PropsWithChildren<CardProps>): JSX.Element {
  const {children, ...rest} = props
  return (
    <Card {...rest} style={tdStyle} as="td">
      {children}
    </Card>
  )
}

export function TH(props: PropsWithChildren<CardProps>): JSX.Element {
  const {children, ...rest} = props
  return (
    <Card {...rest} style={thStyle} as="th">
      {children}
    </Card>
  )
}

export function Table(props: PropsWithChildren<CardProps>): JSX.Element {
  const {children, ...rest} = props
  return (
    <Card {...rest} style={tableStyle} as="table">
      {children}
    </Card>
  )
}
