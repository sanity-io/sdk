/**
 * Typed protocol failures — callers branch on `code` instead of parsing a
 * message string. Domain failures travel in the reply value, never here.
 * @public
 */
export type MessageBusErrorCode =
  | 'NO_RESPONDER'
  | 'TIMEOUT'
  | 'ABORTED'
  | 'HANDLER_THREW'
  | 'PROTOCOL_MISMATCH'
  | 'OWNERSHIP_MISMATCH'
  | 'MISSING_APP_ID'
  | 'BUS_NOT_INSTALLED'

/** @public */
export class MessageBusError extends Error {
  readonly code: MessageBusErrorCode

  constructor(code: MessageBusErrorCode, message?: string, options?: {cause?: unknown}) {
    super(message ?? code, options)
    this.name = 'MessageBusError'
    this.code = code
  }
}
