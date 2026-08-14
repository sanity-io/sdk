import {Box, Flex, Heading, Stack, Text} from '@sanity/ui'
import {type ComponentType, type JSX, type ReactNode, type SVGProps} from 'react'

interface PageLayoutProps {
  children: ReactNode
  title: string
  subtitle: string
  icon?: ComponentType<SVGProps<SVGSVGElement>>
}

export function PageLayout({children, title, subtitle, icon: Icon}: PageLayoutProps): JSX.Element {
  return (
    <Stack gap={5}>
      <Box>
        <Flex align="center" gap={2}>
          {Icon && (
            <Text size={2}>
              <Icon />
            </Text>
          )}
          <Heading as="h1" size={2}>
            {title}
          </Heading>
        </Flex>
        <Box marginTop={2}>
          <Text muted size={1}>
            {subtitle}
          </Text>
        </Box>
      </Box>
      {children}
    </Stack>
  )
}
