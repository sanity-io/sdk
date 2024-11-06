import {sanitySdkStore} from '@sanity/sdk'
import {useStore} from 'zustand'

/** @public */
// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
export const useSanitySdk = (selector: (state: any) => unknown) =>
  useStore(sanitySdkStore, selector)
