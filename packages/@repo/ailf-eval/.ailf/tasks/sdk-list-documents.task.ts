/**
 * Task: List documents with the Sanity App SDK.
 *
 * Evaluates whether an AI coding tool can build a React component that lists documents of type "post" from a dataset.
 */

import {defineSdkTask} from './_defineSdkTask'

// defineSdkTask emits this task twice: as authored, plus an auto-generated
// `sdk-list-documents-with-reference` twin that also injects the App SDK API
// reference doc. See _defineSdkTask.ts.
export default defineSdkTask({
  mode: 'literacy',
  id: 'sdk-list-documents',
  title: 'List documents with the App SDK',
  description: 'Tests building a paginated document list with @sanity/sdk-react',
  area: 'app-sdk',

  // Canonical App SDK docs the pipeline fetches and injects for the
  // baseline evaluation.
  context: {
    docs: [
      {
        slug: 'sdk-react-hooks',
        reason: 'Reference for useDocuments and useDocumentProjection hooks',
      },
    ],
  },
  docCoverage: true,
  // Gold-standard implementation the grader scores code correctness against.
  referenceSolution: 'canonical/sdk-list-documents.tsx',
  prompt: {
    text: `Using the Sanity App SDK (@sanity/sdk-react), create a React component
that lists documents of type "post" from a dataset, ordered by _createdAt, most recent first. 
Only the title of each post should be rendered. There may be many posts, so the list should be progressively loaded.`,
  },
  assertions: [
    {
      type: 'llm-rubric',
      template: 'task-completion',
      criteria: [
        {
          id: 'uses-use-documents',
          text: 'Fetches document handles with the useDocuments hook',
        },
        {
          id: 'orders-by-created-at',
          text: 'Orders results by _createdAt in descending order',
        },
        {
          id: 'projects-title',
          text: 'Renders each document title via useDocumentProjection or useDocumentPreview inside a Suspense boundary',
        },
        {
          id: 'paginates-with-load-more',
          text: 'Renders a load-more control that calls loadMore when hasMore is true',
        },
      ],
    },
    {
      type: 'llm-rubric',
      template: 'code-correctness',
      criteria: [
        {
          id: 'imports-from-sdk-react',
          text: 'Imports the hooks from @sanity/sdk-react',
        },
        {
          id: 'passes-document-handle',
          text: 'Passes the full document handle through to useDocumentProjection or useDocumentPreview',
        },
      ],
    },
  ],
  baseline: {enabled: true, rubric: 'full'},
  status: 'active',
})
