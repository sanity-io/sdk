import {SanityLogo} from '@sanity/logos'
import {Flex, Text} from '@sanity/ui'
import {Fragment} from 'react'
import styled from 'styled-components'

const LINKS = [
  {
    url: 'https://slack.sanity.io/',
    i18nKey: 'workspaces.community-title',
    title: 'Community',
  },
  {
    url: 'https://www.sanity.io/docs',
    i18nKey: 'workspaces.docs-title',
    title: 'Docs',
  },
  {
    url: 'https://www.sanity.io/legal/privacy',
    i18nKey: 'workspaces.privacy-title',
    title: 'Privacy',
  },
  {
    url: 'https://www.sanity.io',
    i18nKey: 'workspaces.sanity-io-title',
    title: 'sanity.io',
  },
]

const StyledText = styled(Text)`
  a {
    color: inherit;
  }
`

/**
 * Default footer component for login screens showing Sanity branding and legal
 * links.
 *
 * @alpha
 */
export function LoginFooter() {
  return (
    <Flex direction="column" gap={4} justify="center" align="center" paddingTop={2}>
      <Text size={3}>
        <SanityLogo />
      </Text>

      <Flex align="center" gap={2}>
        {LINKS.map((link, index) => (
          <Fragment key={link.title}>
            <StyledText muted size={1}>
              <a href={link.url} target="_blank" rel="noopener noreferrer">
                {link.title}
              </a>
            </StyledText>

            {index < LINKS.length - 1 && (
              <Text size={1} muted>
                •
              </Text>
            )}
          </Fragment>
        ))}
      </Flex>
    </Flex>
  )
}
