import {type ComponentType, type JSX, type ReactNode, type SVGProps} from 'react'
import {Box, Flex, Heading, Icon, Text, VStack} from 'ui5'

interface PageLayoutProps {
  children: ReactNode
  title: string
  subtitle: string
  icon?: ComponentType<SVGProps<SVGSVGElement>>
}

export function PageLayout({children, title, subtitle, icon}: PageLayoutProps): JSX.Element {
  return (
    <VStack gap={5}>
      <Box>
        <Flex alignItems="center" gap={2}>
          {icon && <Icon aria-hidden icon={icon} size={2} />}
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
    </VStack>
  )
}
