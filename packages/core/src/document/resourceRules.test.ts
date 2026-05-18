import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {type EditDocumentAction} from './actions'
import {getEffectiveDocModel, normalizeActionsForResource} from './resourceRules'

const datasetResource = {projectId: 'p', dataset: 'd'}
const canvasResource = {canvasId: 'canvas-1'}
const mediaLibraryResource = {mediaLibraryId: 'ml-1'}

function editAction(
  overrides: Partial<EditDocumentAction> & Pick<EditDocumentAction, 'documentId' | 'documentType'>,
): EditDocumentAction {
  return {
    type: 'document.edit',
    patches: [{set: {foo: 'bar'}}],
    ...overrides,
  }
}

describe('getEffectiveDocModel', () => {
  it('returns passthrough for no resource', () => {
    expect(getEffectiveDocModel(undefined, 'anything')).toEqual({
      liveEdit: undefined,
      supportsReleases: true,
    })
  })

  it('returns passthrough for dataset resources', () => {
    expect(getEffectiveDocModel(datasetResource, 'author')).toEqual({
      liveEdit: undefined,
      supportsReleases: true,
    })
  })

  it('forces liveEdit and disallows releases for canvas resources', () => {
    expect(getEffectiveDocModel(canvasResource, 'page')).toEqual({
      liveEdit: true,
      supportsReleases: false,
    })
  })

  it('forces liveEdit for non-asset media library types', () => {
    expect(getEffectiveDocModel(mediaLibraryResource, 'sanity.imageAsset')).toEqual({
      liveEdit: true,
      supportsReleases: false,
    })
  })

  it('keeps draft/published model for sanity.asset in media library', () => {
    expect(getEffectiveDocModel(mediaLibraryResource, 'sanity.asset')).toEqual({
      liveEdit: false,
      supportsReleases: false,
    })
  })
})

describe('normalizeActionsForResource', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  })

  afterEach(() => {
    warnSpy.mockRestore()
  })

  it('leaves dataset edits with a release perspective alone', () => {
    const action = editAction({
      documentId: 'versions.relA.doc1',
      documentType: 'author',
      perspective: {releaseName: 'relA'},
    })

    const result = normalizeActionsForResource([action], datasetResource)

    expect(result[0]).toBe(action)
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('strips release perspective and forces liveEdit for canvas, warning once', () => {
    const action = editAction({
      documentId: 'versions.relA.doc1',
      documentType: 'page',
      perspective: {releaseName: 'relA'},
    })

    const [result] = normalizeActionsForResource([action], canvasResource) as [EditDocumentAction]

    expect(result.liveEdit).toBe(true)
    expect(result.perspective).toBeUndefined()
    expect(result.documentId).toBe('doc1')
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy.mock.calls[0][0]).toContain('Canvas')
    expect(warnSpy.mock.calls[0][0]).toContain('page (doc1)')
  })

  it('strips release perspective and forces liveEdit for non-asset media library types', () => {
    const action = editAction({
      documentId: 'versions.relA.doc1',
      documentType: 'sanity.imageAsset',
      perspective: {releaseName: 'relA'},
    })

    const [result] = normalizeActionsForResource([action], mediaLibraryResource) as [
      EditDocumentAction,
    ]

    expect(result.liveEdit).toBe(true)
    expect(result.perspective).toBeUndefined()
    expect(result.documentId).toBe('doc1')
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy.mock.calls[0][0]).toContain('Media Library')
  })

  it('strips release perspective but keeps draft/publish model for sanity.asset', () => {
    const action = editAction({
      documentId: 'versions.relA.doc1',
      documentType: 'sanity.asset',
      perspective: {releaseName: 'relA'},
    })

    const [result] = normalizeActionsForResource([action], mediaLibraryResource) as [
      EditDocumentAction,
    ]

    expect(result.liveEdit).toBeUndefined()
    expect(result.perspective).toBeUndefined()
    expect(result.documentId).toBe('doc1')
    expect(warnSpy).toHaveBeenCalledTimes(1)
  })

  it('silently forces liveEdit for canvas with no release perspective', () => {
    const action = editAction({
      documentId: 'drafts.doc1',
      documentType: 'page',
      perspective: 'drafts',
    })

    const [result] = normalizeActionsForResource([action], canvasResource) as [EditDocumentAction]

    expect(result.liveEdit).toBe(true)
    expect(result.documentId).toBe('doc1')
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('emits a single warning for multiple stripped actions in one call', () => {
    const a = editAction({
      documentId: 'versions.relA.doc1',
      documentType: 'page',
      perspective: {releaseName: 'relA'},
    })
    const b = editAction({
      documentId: 'versions.relA.doc2',
      documentType: 'page',
      perspective: {releaseName: 'relA'},
    })

    normalizeActionsForResource([a, b], canvasResource)

    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy.mock.calls[0][0]).toContain('doc1')
    expect(warnSpy.mock.calls[0][0]).toContain('doc2')
  })

  it('passes non-edit actions through unchanged', () => {
    const action = {
      type: 'document.publish' as const,
      documentId: 'doc1',
      documentType: 'page',
    }

    const result = normalizeActionsForResource([action], canvasResource)

    expect(result[0]).toBe(action)
    expect(warnSpy).not.toHaveBeenCalled()
  })
})
