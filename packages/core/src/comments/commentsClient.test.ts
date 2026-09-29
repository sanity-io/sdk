import {firstValueFrom, of, toArray} from 'rxjs'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {observeAppOrganizationId} from '../organization/appOrganization'
import {project} from '../project/project'
import {createSanityInstance, type SanityInstance} from '../store/createSanityInstance'
import {ORGANIZATION_ID} from './commentFixtures'
import {
  assertDatasetResource,
  getCommentsClient,
  observeCommentsOrganizationId,
  toTargetDocumentRef,
} from './commentsClient'

vi.mock('../organization/appOrganization', () => ({observeAppOrganizationId: vi.fn()}))
vi.mock('../project/project', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../project/project')>()),
  project: {resolveState: vi.fn()},
}))

describe('observeCommentsOrganizationId', () => {
  const RESOURCE = {projectId: 'p', dataset: 'd'}
  let instance: SanityInstance

  beforeEach(() => {
    vi.clearAllMocks()
    instance = createSanityInstance({projectId: 'p', dataset: 'd'})
  })

  const mockAppOrganization = (organizationId: string | undefined) =>
    vi.mocked(observeAppOrganizationId).mockReturnValue(of(organizationId))

  const mockProjectOrganization = (organizationId: string) =>
    vi
      .mocked(project.resolveState)
      .mockResolvedValue({organizationId} as Awaited<ReturnType<typeof project.resolveState>>)

  it('uses the app organization when there is one', async () => {
    mockAppOrganization(ORGANIZATION_ID)
    mockProjectOrganization(ORGANIZATION_ID)

    await expect(firstValueFrom(observeCommentsOrganizationId(instance, RESOURCE))).resolves.toBe(
      ORGANIZATION_ID,
    )

    instance.dispose()
  })

  it('does not wait for the project check before emitting it', async () => {
    // A standalone app that has configured its organization should not pay for
    // a project read on its first comment read.
    mockAppOrganization(ORGANIZATION_ID)
    vi.mocked(project.resolveState).mockReturnValue(new Promise(() => {}))

    await expect(firstValueFrom(observeCommentsOrganizationId(instance, RESOURCE))).resolves.toBe(
      ORGANIZATION_ID,
    )

    instance.dispose()
  })

  it('errors when the app organization does not own the project', async () => {
    // Standalone apps get the check the Dashboard's AuthBoundary already does.
    mockAppOrganization('org-configured')
    mockProjectOrganization('org-owning')

    await expect(
      firstValueFrom(observeCommentsOrganizationId(instance, RESOURCE).pipe(toArray())),
    ).rejects.toThrow(/belongs to Organization org-owning/)

    instance.dispose()
  })

  it('falls back to the organization owning the project', async () => {
    // Nothing to configure in the common case: a project belongs to exactly one
    // organization, and that is where its comments are.
    mockAppOrganization(undefined)
    mockProjectOrganization('org-owning')

    await expect(firstValueFrom(observeCommentsOrganizationId(instance, RESOURCE))).resolves.toBe(
      'org-owning',
    )

    instance.dispose()
  })

  it('surfaces a failed project read', async () => {
    mockAppOrganization(undefined)
    vi.mocked(project.resolveState).mockRejectedValue(new Error('project unreachable'))

    await expect(firstValueFrom(observeCommentsOrganizationId(instance, RESOURCE))).rejects.toThrow(
      /project unreachable/,
    )

    instance.dispose()
  })

  it('refuses a resource comments cannot live in', () => {
    mockAppOrganization(ORGANIZATION_ID)

    expect(() => observeCommentsOrganizationId(instance, {mediaLibraryId: 'ml-1'})).toThrow(
      /dataset resources/,
    )

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

describe('toTargetDocumentRef', () => {
  const RESOURCE = {projectId: 'p', dataset: 'd'}

  it('names the published document, whichever variant it is given', () => {
    expect(toTargetDocumentRef(RESOURCE, 'doc-1')).toBe('dataset:p.d:doc-1')
    expect(toTargetDocumentRef(RESOURCE, 'drafts.doc-1')).toBe('dataset:p.d:doc-1')
    expect(toTargetDocumentRef(RESOURCE, 'versions.summer.doc-1')).toBe('dataset:p.d:doc-1')
  })

  it('keeps the dots a document id is allowed to carry', () => {
    expect(toTargetDocumentRef(RESOURCE, 'foo.doc-1')).toBe('dataset:p.d:foo.doc-1')
    expect(toTargetDocumentRef(RESOURCE, 'drafts.foo.doc-1')).toBe('dataset:p.d:foo.doc-1')
  })

  it('refuses a resource comments cannot live in', () => {
    expect(() => toTargetDocumentRef({mediaLibraryId: 'ml-1'}, 'doc-1')).toThrow(
      /dataset resources/,
    )
  })

  it('agrees with the client for every id shape', () => {
    // This is a local copy of a format the comment API owns, kept so that the
    // entry keys can be computed without asking the client store for a client.
    // Drop it, and this test, once `getCommentTargetDocumentRef` ships.
    const instance = createSanityInstance({projectId: 'p', dataset: 'd'})
    const {comments} = getCommentsClient(instance, {
      resource: RESOURCE,
      organizationId: ORGANIZATION_ID,
    }).collaboration

    for (const documentId of [
      'doc-1',
      'drafts.doc-1',
      'versions.summer.doc-1',
      'foo.doc-1',
      'drafts.foo.doc-1',
      'versions.summer.foo.doc-1',
    ]) {
      expect(toTargetDocumentRef(RESOURCE, documentId)).toBe(
        comments.getTargetDocumentRef(documentId),
      )
    }

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
