import {Button, Card, Flex} from '@sanity/ui'
import type {JSX} from 'react'
import {Link} from 'react-router'

interface PageNavProps {
  homePath: string
  homeText: string
}

export function PageNav({homePath, homeText}: PageNavProps): JSX.Element {
  return (
    <Card shadow={1} padding={3}>
      <Flex as="nav" align="center" justify="space-between" paddingX={4}>
        <Link to="/" style={{textDecoration: 'none'}}>
          <Button mode="ghost" tone="primary" text="← Kitchen Sink Home" />
        </Link>
        <Link to={homePath} style={{textDecoration: 'none'}}>
          <Button mode="ghost" tone="primary" text={homeText} />
        </Link>
      </Flex>
    </Card>
  )
}
