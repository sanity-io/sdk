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
} from '@sanity/sdk'
import {useCallback} from 'react'
import {firstValueFrom} from 'rxjs'

import {type ResourceHandle} from '../../config/handles'
import {useSanityInstance} from '../context/useSanityInstance'
import {useNormalizedResourceOptions} from '../helpers/useNormalizedResourceOptions'

interface Subscription {
  unsubscribe(): void
}

interface Observer<T> {
  next?: (value: T) => void
  error?: (err: unknown) => void
  complete?: () => void
}

interface Subscribable<T> {
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
 *
 * @remarks
 * This hook provides a stable callback to trigger AI-powered content generation for documents.
 *
 * Features:
 * - Uses instruction templates with `$variables` and supports `instructionParams` (constants, fields, documents, GROQ queries).
 * - Can target specific paths/fields; supports image generation when targeting image fields.
 * - Supports optional `temperature`, `async`, `noWrite`, and `conditionalPaths`.
 * - Returns a Subscribable stream for tracking generation progress.
 *
 * @returns A stable callback that triggers the action and yields a Subscribable stream.
 *
 * @example Basic content generation
 * ```tsx
 * import {useAgentGenerate} from '@sanity/sdk-react'
 *
 * function GenerateDescription({documentId}: {documentId: string}) {
 *   const generate = useAgentGenerate()
 *
 *   const handleGenerate = () => {
 *     generate({
 *       documentId,
 *       instruction: 'Write a compelling product description based on the title: $title',
 *       instructionParams: {
 *         title: {type: 'field', path: 'title'},
 *       },
 *       targetPaths: ['description'],
 *     }).subscribe({
 *       next: (result) => console.log('Generation progress:', result),
 *       complete: () => console.log('Generation complete'),
 *       error: (err) => console.error('Generation failed:', err),
 *     })
 *   }
 *
 *   return <button onClick={handleGenerate}>Generate Description</button>
 * }
 * ```
 *
 * @example Image generation
 * ```tsx
 * import {useAgentGenerate} from '@sanity/sdk-react'
 *
 * function GenerateProductImage({documentId}: {documentId: string}) {
 *   const generate = useAgentGenerate()
 *
 *   const handleGenerateImage = () => {
 *     generate({
 *       documentId,
 *       instruction: 'Generate a product photo for: $productName',
 *       instructionParams: {
 *         productName: {type: 'field', path: 'name'},
 *       },
 *       targetPaths: ['mainImage'],
 *     }).subscribe({
 *       complete: () => console.log('Image generated'),
 *     })
 *   }
 *
 *   return <button onClick={handleGenerateImage}>Generate Image</button>
 * }
 * ```
 *
 * @category Agent Actions
 */
export function useAgentGenerate(
  resourceHandle?: ResourceHandle,
): (options: AgentGenerateOptions) => Subscribable<unknown> {
  const instance = useSanityInstance()
  const {resource} = useNormalizedResourceOptions(resourceHandle ?? {})
  return useCallback(
    (options: AgentGenerateOptions) =>
      agentGenerate(instance, options, resource) as unknown as Subscribable<unknown>,
    [instance, resource],
  )
}

/**
 * @alpha
 * Transforms an existing document or selected fields using Sanity Agent Actions.
 *
 * @remarks
 * This hook provides a stable callback to apply AI-powered transformations to document content.
 *
 * Features:
 * - Accepts `instruction` and `instructionParams` (constants, fields, documents, GROQ queries).
 * - Can write to the same or a different `targetDocument` (create/edit), and target specific paths.
 * - Supports per-path image transform instructions and image description operations.
 * - Optional `temperature`, `async`, `noWrite`, `conditionalPaths`.
 *
 * @returns A stable callback that triggers the action and yields a Subscribable stream.
 *
 * @example Transform text content
 * ```tsx
 * import {useAgentTransform} from '@sanity/sdk-react'
 *
 * function SummarizeArticle({documentId}: {documentId: string}) {
 *   const transform = useAgentTransform()
 *
 *   const handleSummarize = () => {
 *     transform({
 *       documentId,
 *       instruction: 'Summarize the following content into 2-3 sentences: $body',
 *       instructionParams: {
 *         body: {type: 'field', path: 'body'},
 *       },
 *       targetPaths: ['summary'],
 *     }).subscribe({
 *       complete: () => console.log('Summary generated'),
 *       error: (err) => console.error('Transform failed:', err),
 *     })
 *   }
 *
 *   return <button onClick={handleSummarize}>Generate Summary</button>
 * }
 * ```
 *
 * @example Transform and write to a different document
 * ```tsx
 * import {useAgentTransform} from '@sanity/sdk-react'
 *
 * function CreateVariant({sourceDocumentId}: {sourceDocumentId: string}) {
 *   const transform = useAgentTransform()
 *
 *   const handleCreateVariant = () => {
 *     transform({
 *       documentId: sourceDocumentId,
 *       instruction: 'Rewrite this product description for a younger audience: $description',
 *       instructionParams: {
 *         description: {type: 'field', path: 'description'},
 *       },
 *       targetDocument: {
 *         operation: 'create',
 *         _type: 'product',
 *       },
 *       targetPaths: ['description'],
 *     }).subscribe({
 *       next: (result) => console.log('New document:', result),
 *       complete: () => console.log('Variant created'),
 *     })
 *   }
 *
 *   return <button onClick={handleCreateVariant}>Create Youth Variant</button>
 * }
 * ```
 *
 * @category Agent Actions
 */
export function useAgentTransform(
  resourceHandle?: ResourceHandle,
): (options: AgentTransformOptions) => Subscribable<unknown> {
  const instance = useSanityInstance()
  const {resource} = useNormalizedResourceOptions(resourceHandle ?? {})
  return useCallback(
    (options: AgentTransformOptions) =>
      agentTransform(instance, options, resource) as unknown as Subscribable<unknown>,
    [instance, resource],
  )
}

/**
 * @alpha
 * Translates documents or fields using Sanity Agent Actions.
 *
 * @remarks
 * This hook provides a stable callback to translate document content between languages using AI.
 *
 * Features:
 * - Configure `fromLanguage`/`toLanguage`, optional `styleGuide`, and `protectedPhrases`.
 * - Can write into a different `targetDocument`, and/or store language in a field.
 * - Optional `temperature`, `async`, `noWrite`, `conditionalPaths`.
 *
 * @returns A stable callback that triggers the action and yields a Subscribable stream.
 *
 * @example Basic translation
 * ```tsx
 * import {useAgentTranslate} from '@sanity/sdk-react'
 *
 * function TranslateArticle({documentId}: {documentId: string}) {
 *   const translate = useAgentTranslate()
 *
 *   const handleTranslate = () => {
 *     translate({
 *       documentId,
 *       fromLanguage: 'en',
 *       toLanguage: 'es',
 *       targetPaths: ['title', 'body'],
 *     }).subscribe({
 *       complete: () => console.log('Translation complete'),
 *       error: (err) => console.error('Translation failed:', err),
 *     })
 *   }
 *
 *   return <button onClick={handleTranslate}>Translate to Spanish</button>
 * }
 * ```
 *
 * @example Translation with style guide and protected phrases
 * ```tsx
 * import {useAgentTranslate} from '@sanity/sdk-react'
 *
 * function TranslateWithBrandTerms({documentId}: {documentId: string}) {
 *   const translate = useAgentTranslate()
 *
 *   const handleTranslate = () => {
 *     translate({
 *       documentId,
 *       fromLanguage: 'en',
 *       toLanguage: 'fr',
 *       styleGuide: 'Use formal French appropriate for business communication.',
 *       protectedPhrases: ['Acme Corp', 'PowerWidget Pro'],
 *       targetPaths: ['title', 'description'],
 *     }).subscribe({
 *       complete: () => console.log('Translation complete'),
 *     })
 *   }
 *
 *   return <button onClick={handleTranslate}>Translate to French</button>
 * }
 * ```
 *
 * @example Translate to a new document
 * ```tsx
 * import {useAgentTranslate} from '@sanity/sdk-react'
 *
 * function CreateTranslatedCopy({documentId}: {documentId: string}) {
 *   const translate = useAgentTranslate()
 *
 *   const handleCreateTranslation = () => {
 *     translate({
 *       documentId,
 *       fromLanguage: 'en',
 *       toLanguage: 'de',
 *       targetDocument: {
 *         operation: 'create',
 *         _type: 'article',
 *       },
 *       languageFieldPath: 'language',
 *     }).subscribe({
 *       next: (result) => console.log('New translated document:', result),
 *       complete: () => console.log('Translated copy created'),
 *     })
 *   }
 *
 *   return <button onClick={handleCreateTranslation}>Create German Copy</button>
 * }
 * ```
 *
 * @category Agent Actions
 */
export function useAgentTranslate(
  resourceHandle?: ResourceHandle,
): (options: AgentTranslateOptions) => Subscribable<unknown> {
  const instance = useSanityInstance()
  const {resource} = useNormalizedResourceOptions(resourceHandle ?? {})
  return useCallback(
    (options: AgentTranslateOptions) =>
      agentTranslate(instance, options, resource) as unknown as Subscribable<unknown>,
    [instance, resource],
  )
}

/**
 * @alpha
 * Prompts the Content Agent using the same instruction template format as other agent actions.
 *
 * @remarks
 * This hook provides a stable callback to send prompts to the Content Agent and receive responses.
 * Unlike the other agent action hooks, this one does not modify documents—it simply
 * returns the AI's response.
 *
 * Features:
 * - Uses the same instruction template format with `$variables` as other actions.
 * - `format`: 'string' or 'json' (instruction must contain the word "json" for JSON responses).
 * - Supports `instructionParams` for dynamic content (constants, fields, documents, GROQ queries).
 * - Optional `temperature` for controlling response creativity.
 *
 * @returns A stable callback that triggers the action and resolves a Promise with the prompt result.
 *
 * @example Basic string prompt
 * ```tsx
 * import {useState} from 'react'
 * import {useAgentPrompt} from '@sanity/sdk-react'
 *
 * function AskQuestion() {
 *   const prompt = useAgentPrompt()
 *   const [answer, setAnswer] = useState<string>('')
 *
 *   const handleAsk = async () => {
 *     const result = await prompt({
 *       instruction: 'What are the top 3 benefits of content modeling?',
 *       format: 'string',
 *     })
 *     setAnswer(result.output)
 *   }
 *
 *   return (
 *     <div>
 *       <button onClick={handleAsk}>Ask AI</button>
 *       {answer && <p>{answer}</p>}
 *     </div>
 *   )
 * }
 * ```
 *
 * @example JSON response with instruction params
 * ```tsx
 * import {useState} from 'react'
 * import {useAgentPrompt} from '@sanity/sdk-react'
 *
 * interface TagSuggestions {
 *   tags: string[]
 *   reasoning: string
 * }
 *
 * function SuggestTags({documentId}: {documentId: string}) {
 *   const prompt = useAgentPrompt()
 *   const [suggestions, setSuggestions] = useState<TagSuggestions | null>(null)
 *
 *   const handleSuggest = async () => {
 *     const result = await prompt({
 *       instruction: `
 *         Based on the following article title and content, suggest relevant tags.
 *         Return as json with "tags" (array of strings) and "reasoning" (string).
 *         Title: $title
 *         Content: $body
 *       `,
 *       instructionParams: {
 *         title: {type: 'field', path: 'title', documentId},
 *         body: {type: 'field', path: 'body', documentId},
 *       },
 *       format: 'json',
 *     })
 *     setSuggestions(result.output as TagSuggestions)
 *   }
 *
 *   return (
 *     <div>
 *       <button onClick={handleSuggest}>Suggest Tags</button>
 *       {suggestions && (
 *         <div>
 *           <p>Reasoning: {suggestions.reasoning}</p>
 *           <ul>
 *             {suggestions.tags.map((tag) => (
 *               <li key={tag}>{tag}</li>
 *             ))}
 *           </ul>
 *         </div>
 *       )}
 *     </div>
 *   )
 * }
 * ```
 *
 * @category Agent Actions
 */
export function useAgentPrompt(
  resourceHandle?: ResourceHandle,
): (options: AgentPromptOptions) => Promise<AgentPromptResult> {
  const instance = useSanityInstance()
  const {resource} = useNormalizedResourceOptions(resourceHandle ?? {})
  return useCallback(
    (options: AgentPromptOptions) => firstValueFrom(agentPrompt(instance, options, resource)),
    [instance, resource],
  )
}

/**
 * @alpha
 * Schema-aware patching with Sanity Agent Actions.
 *
 * @remarks
 * This hook provides a stable callback to apply schema-validated patches to documents.
 * Unlike {@link useEditDocument}, this uses the Agent Actions API which provides
 * additional schema validation and safe merging capabilities.
 *
 * Features:
 * - Validates provided paths/values against the document schema and merges object values safely.
 * - Prevents duplicate keys and supports array appends (including after a specific keyed item).
 * - Accepts `documentId` or `targetDocument` (mutually exclusive).
 * - Requires `schemaId` (e.g., `'_.schemas.default'`) and `target` to specify patch operations.
 * - Optional `async`, `noWrite`, `conditionalPaths`.
 *
 * Each entry in `target` specifies a `path`, an `operation` (`'set'`, `'append'`, `'mixed'`, or `'unset'`),
 * and a `value` (required for all operations except `'unset'`).
 *
 * @returns A stable callback that triggers the action and resolves a Promise with the patch result.
 *
 * @example Basic field update
 * ```tsx
 * import {useAgentPatch} from '@sanity/sdk-react'
 *
 * function UpdateTitle({documentId}: {documentId: string}) {
 *   const patch = useAgentPatch()
 *
 *   const handleUpdate = async () => {
 *     const result = await patch({
 *       documentId,
 *       schemaId: '_.schemas.default',
 *       target: [
 *         {
 *           path: 'title',
 *           operation: 'set',
 *           value: 'Updated Title',
 *         },
 *         {
 *           path: 'lastModified',
 *           operation: 'set',
 *           value: new Date().toISOString(),
 *         },
 *       ],
 *     })
 *     console.log('Patch result:', result)
 *   }
 *
 *   return <button onClick={handleUpdate}>Update Title</button>
 * }
 * ```
 *
 * @example Append items to an array
 * ```tsx
 * import {useAgentPatch} from '@sanity/sdk-react'
 *
 * function AddTag({documentId}: {documentId: string}) {
 *   const patch = useAgentPatch()
 *
 *   const handleAddTag = async (newTag: string) => {
 *     await patch({
 *       documentId,
 *       schemaId: '_.schemas.default',
 *       target: {
 *         path: 'tags',
 *         operation: 'append',
 *         value: [newTag],
 *       },
 *     })
 *   }
 *
 *   return (
 *     <button onClick={() => handleAddTag('featured')}>
 *       Add Featured Tag
 *     </button>
 *   )
 * }
 * ```
 *
 * @example Insert array item after a specific key
 * ```tsx
 * import {useAgentPatch} from '@sanity/sdk-react'
 *
 * function InsertContentBlock({
 *   documentId,
 *   afterKey,
 * }: {
 *   documentId: string
 *   afterKey: string
 * }) {
 *   const patch = useAgentPatch()
 *
 *   const handleInsert = async () => {
 *     await patch({
 *       documentId,
 *       schemaId: '_.schemas.default',
 *       target: {
 *         path: ['content', {_key: afterKey}],
 *         operation: 'append',
 *         value: [{_type: 'block', text: 'New paragraph inserted here.'}],
 *       },
 *     })
 *   }
 *
 *   return <button onClick={handleInsert}>Insert Block</button>
 * }
 * ```
 *
 * @example Create a new document with targetDocument
 * ```tsx
 * import {useAgentPatch} from '@sanity/sdk-react'
 *
 * function CreateProduct() {
 *   const patch = useAgentPatch()
 *
 *   const handleCreate = async () => {
 *     const result = await patch({
 *       targetDocument: {
 *         operation: 'create',
 *         _type: 'product',
 *       },
 *       schemaId: '_.schemas.default',
 *       target: [
 *         {
 *           path: 'title',
 *           operation: 'set',
 *           value: 'New Product',
 *         },
 *         {
 *           path: 'price',
 *           operation: 'set',
 *           value: 29.99,
 *         },
 *         {
 *           path: 'inStock',
 *           operation: 'set',
 *           value: true,
 *         },
 *       ],
 *     })
 *     console.log('Created document:', result.documentId)
 *   }
 *
 *   return <button onClick={handleCreate}>Create Product</button>
 * }
 * ```
 *
 * @category Agent Actions
 */
export function useAgentPatch(
  resourceHandle?: ResourceHandle,
): (options: AgentPatchOptions) => Promise<AgentPatchResult> {
  const instance = useSanityInstance()
  const {resource} = useNormalizedResourceOptions(resourceHandle ?? {})
  return useCallback(
    (options: AgentPatchOptions) => firstValueFrom(agentPatch(instance, options, resource)),
    [instance, resource],
  )
}
