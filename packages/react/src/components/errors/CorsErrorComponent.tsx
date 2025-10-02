import {useMemo} from 'react'
import {type FallbackProps} from 'react-error-boundary'

import {Error} from './Error'

type CorsErrorComponentProps = FallbackProps & {
  projectId: string | null
}

export function CorsErrorComponent({projectId, error}: CorsErrorComponentProps): React.ReactNode {
  const origin = window.location.origin
  const corsUrl = useMemo(() => {
    const url = new URL(`https://sanity.io/manage/project/${projectId}/api`)
    url.searchParams.set('cors', 'add')
    url.searchParams.set('origin', origin)
    url.searchParams.set('credentials', 'include')
    return url.toString()
  }, [origin, projectId])
  return (
    <Error
      heading="Before you continue..."
      description="To access your content, you need to <b>add the following URL as a CORS origin</b> to your Sanity project."
      code={origin}
      cta={{
        text: 'Manage CORS configuration',
        href: corsUrl,
      }}
      message={projectId ? null : error?.message}
    />
  )
}
