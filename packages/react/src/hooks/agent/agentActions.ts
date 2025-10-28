import {
  agentGenerate,
  type AgentGenerateOptions,
  agentPatch,
  type AgentPatchOptions,
  type AgentPatchResult,
  agentPrompt,
  type AgentPromptOptions,
  type AgentPromptResult,
  agentTransform,
  type AgentTransformOptions,
  agentTranslate,
  type AgentTranslateOptions,
  type SanityInstance,
} from '@sanity/sdk'
import {firstValueFrom} from 'rxjs'

import {createCallbackHook} from '../helpers/createCallbackHook'

interface Subscription {
  unsubscribe(): void
}

interface Observer<T> {
  next?: (value: T) => void
  error?: (err: unknown) => void
  complete?: () => void
}

export interface Subscribable<T> {
  subscribe(observer: Observer<T>): Subscription
  subscribe(
    next: (value: T) => void,
    error?: (err: unknown) => void,
    complete?: () => void,
  ): Subscription
}

/**
 * @alpha
 * Generates content for a document (or specific fields) via Sanity Agent Actions.
 * - Uses instruction templates with `$variables` and supports `instructionParams` (constants, fields, documents, GROQ queries).
 * - Can target specific paths/fields; supports image generation when targeting image fields.
 * - Supports optional `temperature`, `async`, `noWrite`, and `conditionalPaths`.
 *
 * Returns a stable callback that triggers the action and yields a Subscribable stream.
 */
export const useAgentGenerate: () => (options: AgentGenerateOptions) => Subscribable<unknown> =
  createCallbackHook(agentGenerate) as unknown as () => (
    options: AgentGenerateOptions,
  ) => Subscribable<unknown>

/**
 * @alpha
 * Transforms an existing document or selected fields using Sanity Agent Actions.
 * - Accepts `instruction` and `instructionParams` (constants, fields, documents, GROQ queries).
 * - Can write to the same or a different `targetDocument` (create/edit), and target specific paths.
 * - Supports per-path image transform instructions and image description operations.
 * - Optional `temperature`, `async`, `noWrite`, `conditionalPaths`.
 *
 * Returns a stable callback that triggers the action and yields a Subscribable stream.
 */
export const useAgentTransform: () => (options: AgentTransformOptions) => Subscribable<unknown> =
  createCallbackHook(agentTransform) as unknown as () => (
    options: AgentTransformOptions,
  ) => Subscribable<unknown>

/**
 * @alpha
 * Translates documents or fields using Sanity Agent Actions.
 * - Configure `fromLanguage`/`toLanguage`, optional `styleGuide`, and `protectedPhrases`.
 * - Can write into a different `targetDocument`, and/or store language in a field.
 * - Optional `temperature`, `async`, `noWrite`, `conditionalPaths`.
 *
 * Returns a stable callback that triggers the action and yields a Subscribable stream.
 */
export const useAgentTranslate: () => (options: AgentTranslateOptions) => Subscribable<unknown> =
  createCallbackHook(agentTranslate) as unknown as () => (
    options: AgentTranslateOptions,
  ) => Subscribable<unknown>

/**
 * @alpha
 * Prompts the LLM using the same instruction template format as other actions.
 * - `format`: 'string' or 'json' (instruction must contain the word "json" for JSON responses).
 * - Optional `temperature`.
 *
 * Returns a stable callback that triggers the action and resolves a Promise with the prompt result.
 */
function promptAdapter(
  instance: SanityInstance,
  options: AgentPromptOptions,
): Promise<AgentPromptResult> {
  return firstValueFrom(agentPrompt(instance, options))
}

export const useAgentPrompt: () => (options: AgentPromptOptions) => Promise<AgentPromptResult> =
  createCallbackHook(promptAdapter)

/**
 * @alpha
 * Schema-aware patching with Sanity Agent Actions.
 * - Validates provided paths/values against the document schema and merges object values safely.
 * - Prevents duplicate keys and supports array appends (including after a specific keyed item).
 * - Accepts `documentId` or `targetDocument` (mutually exclusive).
 * - Optional `async`, `noWrite`, `conditionalPaths`.
 *
 * Returns a stable callback that triggers the action and resolves a Promise with the patch result.
 */
function patchAdapter(
  instance: SanityInstance,
  options: AgentPatchOptions,
): Promise<AgentPatchResult> {
  return firstValueFrom(agentPatch(instance, options))
}

export const useAgentPatch: () => (options: AgentPatchOptions) => Promise<AgentPatchResult> =
  createCallbackHook(patchAdapter)
