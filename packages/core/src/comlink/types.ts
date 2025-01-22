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
