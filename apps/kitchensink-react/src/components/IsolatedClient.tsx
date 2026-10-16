import {createSanityInstance, type SanityInstance} from '@sanity/sdk'
import {SanityInstanceProvider} from '@sanity/sdk-react'
import {Spinner} from '@sanity/ui'
import {type ReactNode, useEffect, useState} from 'react'

import {isE2E} from '../sanityConfigs'

/**
 * Renders its children inside an independent, explicitly configured
 * SanityInstance so each subtree behaves like a separate client: edits
 * round-trip through the Content Lake listener instead of sharing a
 * document store. The explicit projectId/dataset config is also required
 * by `SDKValuePlugin`, which calls core APIs on the context instance directly
 * rather than resolving resources from the document handle.
 */
export function IsolatedClient({
  projectId,
  dataset,
  children,
}: {
  projectId: string
  dataset: string
  children: ReactNode
}): ReactNode {
  const [instance] = useState<SanityInstance>(() =>
    createSanityInstance({
      projectId,
      dataset,
      // Standalone instances don't inherit SanityApp's config, so in e2e
      // mode they need the staging API host set explicitly like App.tsx.
      ...(isE2E ? {auth: {apiHost: 'https://api.sanity.work'}} : {}),
    }),
  )

  useEffect(() => {
    return () => instance.dispose()
  }, [instance])

  return (
    <SanityInstanceProvider instance={instance} fallback={<Spinner />}>
      {children}
    </SanityInstanceProvider>
  )
}
