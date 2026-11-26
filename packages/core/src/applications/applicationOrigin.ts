import {type ApplicationBase} from './applications'

type SanityGlobal = typeof globalThis & {__SANITY_STAGING__?: boolean}

/**
 * The origin an application is served from, or `null` when it has neither an external URL nor
 * a slug to derive one from. Callers treat `null` as "nothing to load" rather than failing the
 * whole list on one bad record.
 *
 * @internal
 */
export function getApplicationOrigin(
  application: Pick<
    ApplicationBase,
    'externalUrl' | 'slug' | 'isSingleton' | 'organizationId' | 'isLegacy'
  > & {type?: string},
): string | null {
  if (application.externalUrl !== null) return new URL(application.externalUrl).origin
  if (application.slug === null) return null

  // Read at runtime, not via a bundler define: a remote is built once and runs in whichever
  // host page loaded it, and the host sets this flag. Mirrors workbench's `getSanityEnv`.
  const staging = (globalThis as SanityGlobal).__SANITY_STAGING__ === true
  // Custom (non-legacy) core apps share the singleton host. A record without `isLegacy` comes from
  // a host that predates that address, so it keeps the slug address.
  const isSanityHostedCustomApp = application.type === 'coreApp' && application.isLegacy === false
  if (application.isSingleton || isSanityHostedCustomApp) {
    const domain = staging ? 'run.sanity.work' : 'sanity.run'
    return `https://${application.slug}--apps--${application.organizationId}.${domain}`
  }

  const domain = staging ? 'studio.sanity.work' : 'sanity.studio'
  return `https://${application.slug}.${domain}`
}
