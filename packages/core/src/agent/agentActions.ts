import {type SanityClient} from '@sanity/client'
import {from, Observable, switchMap} from 'rxjs'

import {getClientState} from '../client/clientStore'
import {type DatasetSource, isDatasetSource, resolveDefaultSource} from '../config/sanityConfig'
import {type SanityInstance} from '../store/createSanityInstance'

const API_VERSION = 'vX'

function resolveDatasetConfig(instance: SanityInstance): DatasetSource {
  const source = resolveDefaultSource(instance.config)
  if (source && isDatasetSource(source)) return source
  throw new Error(
    'Agent actions require a dataset source. ' +
      'Register a "default" dataset source in config.sources, or pass projectId/dataset explicitly.',
  )
}

/** @alpha */
export type AgentGenerateOptions = Parameters<
  SanityClient['observable']['agent']['action']['generate']
>[0]

/** @alpha */
export type AgentTransformOptions = Parameters<
  SanityClient['observable']['agent']['action']['transform']
>[0]

/** @alpha */
export type AgentTranslateOptions = Parameters<
  SanityClient['observable']['agent']['action']['translate']
>[0]

/** @alpha */
export type AgentPromptOptions = Parameters<SanityClient['agent']['action']['prompt']>[0]

/** @alpha */
export type AgentPatchOptions = Parameters<SanityClient['agent']['action']['patch']>[0]

/** @alpha */
export type AgentGenerateResult = Awaited<
  ReturnType<SanityClient['observable']['agent']['action']['generate']>
>

/** @alpha */
export type AgentTransformResult = Awaited<
  ReturnType<SanityClient['observable']['agent']['action']['transform']>
>

/** @alpha */
export type AgentTranslateResult = Awaited<
  ReturnType<SanityClient['observable']['agent']['action']['translate']>
>

/** @alpha */
export type AgentPromptResult = Awaited<ReturnType<SanityClient['agent']['action']['prompt']>>

/** @alpha */
export type AgentPatchResult = Awaited<ReturnType<SanityClient['agent']['action']['patch']>>

/**
 * Generates a new document using the agent.
 * @param instance - The Sanity instance.
 * @param options - The options for the agent generate action. See the [Agent Actions API](https://www.sanity.io/docs/agent-actions/introduction) for more details.
 * @returns An Observable emitting the result of the agent generate action.
 * @alpha
 */
export function agentGenerate(
  instance: SanityInstance,
  options: AgentGenerateOptions,
): AgentGenerateResult {
  const {projectId, dataset} = resolveDatasetConfig(instance)
  return getClientState(instance, {
    apiVersion: API_VERSION,
    projectId,
    dataset,
  }).observable.pipe(switchMap((client) => client.observable.agent.action.generate(options)))
}

/**
 * Transforms a document using the agent.
 * @param instance - The Sanity instance.
 * @param options - The options for the agent transform action. See the [Agent Actions API](https://www.sanity.io/docs/agent-actions/introduction) for more details.
 * @returns An Observable emitting the result of the agent transform action.
 * @alpha
 */
export function agentTransform(
  instance: SanityInstance,
  options: AgentTransformOptions,
): AgentTransformResult {
  const {projectId, dataset} = resolveDatasetConfig(instance)
  return getClientState(instance, {
    apiVersion: API_VERSION,
    projectId,
    dataset,
  }).observable.pipe(switchMap((client) => client.observable.agent.action.transform(options)))
}

/**
 * Translates a document using the agent.
 * @param instance - The Sanity instance.
 * @param options - The options for the agent translate action. See the [Agent Actions API](https://www.sanity.io/docs/agent-actions/introduction) for more details.
 * @returns An Observable emitting the result of the agent translate action.
 * @alpha
 */
export function agentTranslate(
  instance: SanityInstance,
  options: AgentTranslateOptions,
): AgentTranslateResult {
  const {projectId, dataset} = resolveDatasetConfig(instance)
  return getClientState(instance, {
    apiVersion: API_VERSION,
    projectId,
    dataset,
  }).observable.pipe(switchMap((client) => client.observable.agent.action.translate(options)))
}

/**
 * Prompts the agent using the same instruction template format as the other actions, but returns text or json instead of acting on a document.
 * @param instance - The Sanity instance.
 * @param options - The options for the agent prompt action. See the [Agent Actions API](https://www.sanity.io/docs/agent-actions/introduction) for more details.
 * @returns An Observable emitting the result of the agent prompt action.
 * @alpha
 */
export function agentPrompt(
  instance: SanityInstance,
  options: AgentPromptOptions,
): Observable<AgentPromptResult> {
  const {projectId, dataset} = resolveDatasetConfig(instance)
  return getClientState(instance, {
    apiVersion: API_VERSION,
    projectId,
    dataset,
  }).observable.pipe(switchMap((client) => from(client.agent.action.prompt(options))))
}

/**
 * Patches a document using the agent.
 * @param instance - The Sanity instance.
 * @param options - The options for the agent patch action. See the [Agent Actions API](https://www.sanity.io/docs/agent-actions/introduction) for more details.
 * @returns An Observable emitting the result of the agent patch action.
 * @alpha
 */
export function agentPatch(
  instance: SanityInstance,
  options: AgentPatchOptions,
): Observable<AgentPatchResult> {
  const {projectId, dataset} = resolveDatasetConfig(instance)
  return getClientState(instance, {
    apiVersion: API_VERSION,
    projectId,
    dataset,
  }).observable.pipe(switchMap((client) => from(client.agent.action.patch(options))))
}
