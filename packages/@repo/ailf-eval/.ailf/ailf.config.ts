/**
 * .ailf/ailf.config.ts — AI Literacy Framework project configuration.
 *
 * Auto-loaded by `ailf run` from <cwd>/.ailf/ (TS takes priority over YAML).
 * Run from this package dir so AILF finds it. Replaces the former
 * config.yaml — `defineRepoConfig` gives type-checking and editor
 * autocomplete on every field.
 */

import {defineRepoConfig} from '@sanity/ailf'

export default defineRepoConfig({
  // Which Sanity project/dataset holds the docs under test.
  source: {
    projectId: '3do82whm',
    dataset: 'next',
    baseUrl: 'https://www.sanity.io/docs',
  },

  // Load tasks from THIS repo's .ailf/tasks/ instead of the bundled corpus
  // shipped inside @sanity/ailf. Without this, local runs evaluate the
  // bundled tasks and never see ours.
  taskSource: {
    type: 'repo',
  },
  owner: {
    team: 'sdk',
  },
})
