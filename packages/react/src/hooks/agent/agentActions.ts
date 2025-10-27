import {
  agentGenerate,
  type AgentGenerateOptions,
  type AgentGenerateResult,
  agentPatch,
  type AgentPatchOptions,
  type AgentPatchResult,
  agentPrompt,
  type AgentPromptOptions,
  type AgentPromptResult,
  agentTransform,
  type AgentTransformOptions,
  type AgentTransformResult,
  agentTranslate,
  type AgentTranslateOptions,
  type AgentTranslateResult,
} from '@sanity/sdk'
import {type Observable} from 'rxjs'

import {createCallbackHook} from '../helpers/createCallbackHook'

/**
 * @alpha
 * Generates content for a document (or specific fields) via Sanity Agent Actions.
 * - Uses instruction templates with `$variables` and supports `instructionParams` (constants, fields, documents, GROQ queries).
 * - Can target specific paths/fields; supports image generation when targeting image fields.
 * - Supports optional `temperature`, `async`, `noWrite`, and `conditionalPaths`.
 *
 * Returns a stable callback that triggers the action and yields an Observable result.
 */
export const useAgentGenerate: () => (options: AgentGenerateOptions) => AgentGenerateResult =
  createCallbackHook(agentGenerate)

/**
 * @alpha
 * Transforms an existing document or selected fields using Sanity Agent Actions.
 * - Accepts `instruction` and `instructionParams` (constants, fields, documents, GROQ queries).
 * - Can write to the same or a different `targetDocument` (create/edit), and target specific paths.
 * - Supports per-path image transform instructions and image description operations.
 * - Optional `temperature`, `async`, `noWrite`, `conditionalPaths`.
 *
 * Returns a stable callback that triggers the action and yields an Observable result.
 */
export const useAgentTransform: () => (options: AgentTransformOptions) => AgentTransformResult =
  createCallbackHook(agentTransform)

/**
 * @alpha
 * Translates documents or fields using Sanity Agent Actions.
 * - Configure `fromLanguage`/`toLanguage`, optional `styleGuide`, and `protectedPhrases`.
 * - Can write into a different `targetDocument`, and/or store language in a field.
 * - Optional `temperature`, `async`, `noWrite`, `conditionalPaths`.
 *
 * Returns a stable callback that triggers the action and yields an Observable result.
 */
export const useAgentTranslate: () => (options: AgentTranslateOptions) => AgentTranslateResult =
  createCallbackHook(agentTranslate)

/**
 * @alpha
 * Prompts the LLM using the same instruction template format as other actions.
 * - `format`: 'string' or 'json' (instruction must contain the word "json" for JSON responses).
 * - Optional `temperature`.
 *
 * Returns a stable callback that triggers the action and yields a one-shot Observable of the prompt result.
 */
export const useAgentPrompt: () => (options: AgentPromptOptions) => Observable<AgentPromptResult> =
  createCallbackHook(agentPrompt)

/**
 * @alpha
 * Schema-aware patching with Sanity Agent Actions.
 * - Validates provided paths/values against the document schema and merges object values safely.
 * - Prevents duplicate keys and supports array appends (including after a specific keyed item).
 * - Accepts `documentId` or `targetDocument` (mutually exclusive).
 * - Optional `async`, `noWrite`, `conditionalPaths`.
 *
 * Returns a stable callback that triggers the action and yields a one-shot Observable of the patch result.
 */
export const useAgentPatch: () => (options: AgentPatchOptions) => Observable<AgentPatchResult> =
  createCallbackHook(agentPatch)
