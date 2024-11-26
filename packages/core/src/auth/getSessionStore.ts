import {getOrCreateResource} from '../instance/sanityInstance'
import type {SanityInstance} from '../instance/types'
import {createSessionStore, type SessionStore} from './sessionStore'

/** @public */
export const getSessionStore = (instance: SanityInstance): SessionStore => {
  const sessionStore = getOrCreateResource(instance, 'sessionStore', () => {
    return createSessionStore()
  })

  return sessionStore
}
