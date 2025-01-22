import {SanityLogo} from '@sanity/logos'
import {Fragment} from 'react'

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
    <div className="sc-login-footer">
      <SanityLogo className="sc-login-footer__logo" />

      <div className="sc-login-footer__links">
        {LINKS.map((link, index) => (
          <Fragment key={link.title}>
            <p className="sc-login-footer__link">
              <a href={link.url} target="_blank" rel="noopener noreferrer">
                {link.title}
              </a>
            </p>

            {index < LINKS.length - 1 && <p className="sc-login-footer__separator">•</p>}
          </Fragment>
        ))}
      </div>
    </div>
  )
}
