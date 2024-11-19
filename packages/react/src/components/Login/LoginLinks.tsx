import {useLoginLinks} from '../../hooks/auth/useLoginLinks'

/**
 * A component that renders login links for Sanity
 * @public
 */
export const LoginLinks = ({projectId}: {projectId: string}): JSX.Element => {
  const authProviders = useLoginLinks(projectId)
  return (
    <div>
      {authProviders.map((provider) => (
        <div key={provider.name}>
          <a href={provider.url}>{provider.title}</a>
        </div>
      ))}
    </div>
  )
}
