import {type Mutation, type SanityDocument} from '@sanity/types'
import {evaluateSync, type ExprNode} from 'groq-js'

import {type Grant} from '../permissions'
import {type DocumentSet} from '../processMutations'
import {type HttpAction} from '../reducers'

export interface ActionHandlerContext {
  base: DocumentSet
  working: DocumentSet
  transactionId: string
  timestamp: string
  grants: Record<Grant, ExprNode>
  outgoingActions: HttpAction[]
  outgoingMutations: Mutation[]
}

export interface ActionHandlerResult {
  base: DocumentSet
  working: DocumentSet
}

export function checkGrant(grantExpr: ExprNode, document: SanityDocument): boolean {
  const value = evaluateSync(grantExpr, {params: {document}})
  return value.type === 'boolean' && value.data
}

interface ActionErrorOptions {
  message: string
  documentId: string
  transactionId: string
}

/**
 * Thrown when a precondition for an action failed.
 */
export class ActionError extends Error implements ActionErrorOptions {
  documentId!: string
  transactionId!: string

  constructor(options: ActionErrorOptions) {
    super(options.message)
    Object.assign(this, options)
  }
}

export class PermissionActionError extends ActionError {}
