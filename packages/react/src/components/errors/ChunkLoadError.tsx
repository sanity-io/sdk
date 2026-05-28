import {useEffect} from 'react'
import {type FallbackProps} from 'react-error-boundary'

import {clearChunkReloadFlag, readChunkReloadFlag, setChunkReloadFlag} from './chunkReloadStorage'
import {Error} from './Error'

function reload(): void {
  try {
    window.location.reload()
  } catch {
    // No-op: nothing useful we can do if reload itself throws.
  }
}

/**
 * Default fallback rendered when a dynamic-import or chunk-load error
 * bubbles up to the SDK's top-level error boundary.
 *
 * On the first occurrence in a session we set a flag and trigger
 * window.location.reload(), since chunk-load errors almost always indicate a
 * stale tab that simply needs a fresh index.html. If the flag is already set
 * we render a manual reload UI instead, which prevents an infinite reload
 * loop in the rare case the error is genuinely unrecoverable (network
 * outage, CSP, etc.).
 *
 * @internal
 */
export function ChunkLoadError(_props: FallbackProps): React.ReactNode {
  const alreadyAttempted = readChunkReloadFlag()

  useEffect(() => {
    if (alreadyAttempted) return
    setChunkReloadFlag()
    reload()
  }, [alreadyAttempted])

  if (!alreadyAttempted) {
    // Render nothing during the brief window before the page reloads so the
    // user does not see a flash of error UI.
    return null
  }

  return (
    <Error
      heading="A new version is available"
      description="The page tried to load an asset that no longer exists. Reload to continue with the latest version."
      cta={{
        text: 'Reload page',
        onClick: () => {
          clearChunkReloadFlag()
          reload()
        },
      }}
    />
  )
}
