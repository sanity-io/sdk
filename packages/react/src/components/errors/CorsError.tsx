import {useMemo} from 'react'
import {type FallbackProps} from 'react-error-boundary'

export type CorsErrorProps = FallbackProps & {
  projectId: string | null
}

export function CorsError({projectId, error}: CorsErrorProps): React.ReactNode {
  const origin = window.location.origin
  const corsUrl = useMemo(() => {
    const url = new URL(`https://sanity.io/manage/project/${projectId}/api`)
    url.searchParams.set('cors', 'add')
    url.searchParams.set('origin', origin)
    url.searchParams.set('credentials', 'include')
    return url.toString()
  }, [origin, projectId])
  return (
    <div className="sc-login-error">
      <div className="sc-login-error__content">
        <h1>Before you continue...</h1>
        <p>
          To access your content, you need to <b>add the following URL as a CORS origin</b> to your
          Sanity project.
        </p>
        <p>
          <code>{origin}</code>
        </p>
        {projectId ? (
          <p>
            <a href={corsUrl ?? ''} target="_blank" rel="noopener noreferrer">
              Manage CORS configuration
            </a>
          </p>
        ) : (
          <p>{error?.message}</p>
        )}
      </div>
    </div>
  )
}
