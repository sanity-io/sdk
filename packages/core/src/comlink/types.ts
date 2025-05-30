import {type Message} from '@sanity/comlink'

/**
 * Message sent from a containing app to an iframe
 * @public
 */
export type FrameMessage = Message

/**
 * Message sent from an iframe to a containing app
 * @public
 */
export type WindowMessage = Message

/**
 * Message from SDK (iframe) to Parent (dashboard) to request a new token
 * @internal
 */
export type RequestNewTokenMessage = {
  type: 'dashboard/v1/auth/tokens/create'
  payload?: undefined
}

/**
 * Message from Parent (dashboard) to SDK (iframe) with the new token
 * @internal
 */
export type NewTokenResponseMessage = {
  type: 'dashboard/v1/auth/tokens/create'
  payload: {token: string | null; error?: string}
}
