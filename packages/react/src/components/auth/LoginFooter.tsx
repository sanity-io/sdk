import {SanityLogo} from '@sanity/logos'
import {Box, Flex, Inline, Text} from '@sanity/ui'

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

/**
 * Default footer component for login screens showing Sanity branding and legal
 * links.
 *
 * @alpha
 */
export function LoginFooter(): React.ReactNode {
  return (
    <Box>
      <Flex justify="center">
        <SanityLogo />
      </Flex>

      <Flex justify="center">
        <Inline space={2} paddingY={3}>
          {LINKS.map((link) => (
            <Text size={0} key={link.url}>
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{color: 'inherit'}}
              >
                {link.title}
              </a>
            </Text>
          ))}
        </Inline>
      </Flex>
    </Box>
  )
}
