import {createAuthStore} from '@sanity/sdk'
import {useStore} from 'zustand'

import {useSanityInstance} from '../context/useSanityInstance'

export function useAuthStateAlt() {
  const instance = useSanityInstance()
  const {publicAuthStore} = createAuthStore(instance)

  return useStore(publicAuthStore)
}
