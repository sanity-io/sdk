import {Box, Card, Container, Heading, Stack, Text} from '@sanity/ui'
import {type JSX, ReactNode} from 'react'

import {PageNav} from './PageNav'

interface PageLayoutProps {
  children: ReactNode
  title: string
  subtitle: string
  homePath: string
  homeText: string
  hideNav?: boolean
}

export function PageLayout({
  children,
  title,
  subtitle,
  homePath,
  homeText,
  hideNav = false,
}: PageLayoutProps): JSX.Element {
  return (
    <Box style={{width: '100%'}}>
      {!hideNav && <PageNav homePath={homePath} homeText={homeText} />}

      <Container width={2} padding={7}>
        <Card padding={5} radius={3} shadow={1}>
          <Stack space={5}>
            <Box>
              <Heading as="h1" size={4} align="center">
                {title}
              </Heading>
              <Box marginTop={3}>
                <Text align="center" size={2} style={{color: '#6e7683'}}>
                  {subtitle}
                </Text>
              </Box>
            </Box>
            {children}
          </Stack>
        </Card>
      </Container>
    </Box>
  )
}
