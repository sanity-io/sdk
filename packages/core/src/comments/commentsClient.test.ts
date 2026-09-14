import {describe, expect, it} from 'vitest'

import {createSanityInstance} from '../store/createSanityInstance'
import {ORGANIZATION_ID} from './commentFixtures'
import {assertDatasetResource, getCommentsClient, requireOrganizationId} from './commentsClient'

describe('requireOrganizationId', () => {
  it('takes the organization from the instance config', () => {
    const instance = createSanityInstance({
      projectId: 'p',
      dataset: 'd',
      collaboration: {organizationId: ORGANIZATION_ID},
    })

    expect(requireOrganizationId(instance, {})).toBe(ORGANIZATION_ID)
    instance.dispose()
  })

  it('lets a call override the configured organization', () => {
    const instance = createSanityInstance({
      projectId: 'p',
      dataset: 'd',
      collaboration: {organizationId: ORGANIZATION_ID},
    })

    expect(requireOrganizationId(instance, {collaboration: {organizationId: 'org-2'}})).toBe(
      'org-2',
    )
    instance.dispose()
  })

  it('says what is missing when no organization is configured', () => {
    // Comments cannot be read or written at all without one, so the failure has
    // to name the setting rather than surfacing as a 400 from the API.
    const instance = createSanityInstance({projectId: 'p', dataset: 'd'})

    expect(() => requireOrganizationId(instance, {})).toThrow(/collaboration: \{organizationId\}/)
    instance.dispose()
  })
})

describe('getCommentsClient', () => {
  it('configures the client with the organization and the dataset resource', () => {
    const instance = createSanityInstance({projectId: 'p', dataset: 'd'})

    const config = getCommentsClient(instance, {
      resource: {projectId: 'p', dataset: 'd'},
      organizationId: ORGANIZATION_ID,
    }).config()

    // The client derives the comment API's `resourceType` and `resourceId` from
    // the project and dataset, and stays on the project API domain, which is
    // what keeps existing CORS and Studio cookie behaviour.
    expect(config.collaboration).toEqual({organizationId: ORGANIZATION_ID})
    expect(config.projectId).toBe('p')
    expect(config.dataset).toBe('d')
    expect(config.useProjectHostname).toBe(true)

    instance.dispose()
  })

  it('builds target document references from the dataset resource', () => {
    const instance = createSanityInstance({projectId: 'p', dataset: 'd'})
    const client = getCommentsClient(instance, {
      resource: {projectId: 'p', dataset: 'd'},
      organizationId: ORGANIZATION_ID,
    })

    // Draft and version ids normalise to the published one, which is what makes
    // a single reference span every variant of a document.
    expect(client.collaboration.comments.getTargetDocumentRef('doc-1')).toBe('dataset:p.d:doc-1')
    expect(client.collaboration.comments.getTargetDocumentRef('drafts.doc-1')).toBe(
      'dataset:p.d:doc-1',
    )
    expect(client.collaboration.comments.getTargetDocumentRef('versions.summer.doc-1')).toBe(
      'dataset:p.d:doc-1',
    )

    instance.dispose()
  })
})

describe('assertDatasetResource', () => {
  it('passes a dataset resource through', () => {
    expect(assertDatasetResource({projectId: 'p', dataset: 'd'})).toEqual({
      projectId: 'p',
      dataset: 'd',
    })
  })

  it('refuses a resource comments cannot live in', () => {
    expect(() => assertDatasetResource({mediaLibraryId: 'ml-1'})).toThrow(/dataset resources/)
    expect(() => assertDatasetResource({canvasId: 'canvas-1'})).toThrow(/dataset resources/)
  })
})
