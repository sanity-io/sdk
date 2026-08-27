import {
  addReaction,
  createComment,
  removeComment,
  removeReaction,
  replyToComment,
  setCommentStatus,
  updateComment,
  updateCommentRange,
} from '@sanity/sdk'
import {renderHook} from '@testing-library/react'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {ResourceProvider} from '../../context/ResourceProvider'
import {ResourcesContext} from '../../context/ResourcesContext'
import {useCommentActions} from './useCommentActions'

vi.mock('@sanity/sdk', async (importOriginal) => {
  const original = await importOriginal<typeof import('@sanity/sdk')>()
  return {
    ...original,
    createComment: vi.fn(),
    replyToComment: vi.fn(),
    updateComment: vi.fn(),
    updateCommentRange: vi.fn(),
    setCommentStatus: vi.fn(),
    removeComment: vi.fn(),
    addReaction: vi.fn(),
    removeReaction: vi.fn(),
  }
})

const HANDLE = {documentId: 'doc-1', documentType: 'author'}

/** Creates name a field, since a comment with no path is refused. */
const CREATE = {...HANDLE, fieldPath: 'name'}

const MESSAGE = [{_type: 'block', _key: 'b1', children: [{_type: 'span', text: 'hi'}]}]

const RANGE = {start: {_key: 'b1', offset: 0}, end: {_key: 'b1', offset: 5}}

// Hoisted: an inline object here would be a new value on every render, and the
// callbacks are memoised against it.
const RESOURCES = {other: {projectId: 'p2', dataset: 'd2'}}

/** Hoisted for the same reason as `RESOURCES`. */
const RELEASE_PERSPECTIVE = {releaseName: 'summer'}

function Wrapper({children}: {children: React.ReactNode}) {
  return (
    <ResourceProvider projectId="p" dataset="d" fallback={null}>
      <ResourcesContext.Provider value={RESOURCES}>{children}</ResourcesContext.Provider>
    </ResourceProvider>
  )
}

function PerspectiveWrapper({children}: {children: React.ReactNode}) {
  return (
    <ResourceProvider projectId="p" dataset="d" perspective={RELEASE_PERSPECTIVE} fallback={null}>
      <ResourcesContext.Provider value={RESOURCES}>{children}</ResourcesContext.Provider>
    </ResourceProvider>
  )
}

function setup(wrapper: typeof Wrapper = Wrapper) {
  return renderHook(() => useCommentActions(), {wrapper})
}

describe('useCommentActions', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('keeps the callbacks stable across renders', () => {
    const {result, rerender} = setup()
    const first = result.current

    rerender()

    expect(result.current).toBe(first)
  })

  it('forwards each action to the store', () => {
    const {result} = setup()

    result.current.createComment({...CREATE, message: MESSAGE})
    result.current.replyToComment({...HANDLE, parentCommentId: 'p1', message: MESSAGE})
    result.current.updateComment({commentId: 'c1', message: MESSAGE})
    result.current.updateCommentRange({commentId: 'c1', range: RANGE})
    result.current.setCommentStatus({commentId: 'c1', status: 'resolved'})
    result.current.removeComment({commentId: 'c1'})
    result.current.addReaction({commentId: 'c1', shortName: ':+1:'})
    result.current.removeReaction({commentId: 'c1', shortName: ':+1:'})

    expect(createComment).toHaveBeenCalledOnce()
    expect(replyToComment).toHaveBeenCalledOnce()
    expect(updateComment).toHaveBeenCalledOnce()
    expect(updateCommentRange).toHaveBeenCalledOnce()
    expect(setCommentStatus).toHaveBeenCalledOnce()
    expect(removeComment).toHaveBeenCalledOnce()
    expect(addReaction).toHaveBeenCalledOnce()
    expect(removeReaction).toHaveBeenCalledOnce()
  })

  it('fills in the resource from context', () => {
    const {result} = setup()

    result.current.createComment({...CREATE, message: MESSAGE})

    expect(createComment).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({resource: {projectId: 'p', dataset: 'd'}}),
    )
  })

  it('lets a call choose a different named resource', () => {
    // Resolution happens per call, so one set of callbacks serves several
    // resources.
    const {result} = setup()

    result.current.removeComment({commentId: 'c1', resourceName: 'other'})

    expect(removeComment).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({resource: {projectId: 'p2', dataset: 'd2'}}),
    )
  })

  it('rejects a call naming a resource that is not in context', () => {
    const {result} = setup()

    expect(() => result.current.removeComment({commentId: 'c1', resourceName: 'missing'})).toThrow(
      /no resource named "missing"/,
    )
  })

  it('passes a per-call organization straight through', () => {
    // Comments live in an organization store rather than the dataset, so this is
    // the only thing saying where a write lands.
    const {result} = setup()

    result.current.addReaction({
      commentId: 'c1',
      shortName: ':+1:',
      collaboration: {organizationId: 'org-2'},
    })

    expect(addReaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({collaboration: {organizationId: 'org-2'}}),
    )
  })

  it('fills in the perspective from context', () => {
    // Core turns a release perspective into the source document id the comment
    // is written against, so losing it here files the comment against the wrong
    // release and nothing reports an error.
    const {result} = setup(PerspectiveWrapper)

    result.current.createComment({...CREATE, message: MESSAGE})
    result.current.replyToComment({...HANDLE, parentCommentId: 'p1', message: MESSAGE})

    expect(createComment).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({perspective: RELEASE_PERSPECTIVE}),
    )
    expect(replyToComment).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({perspective: RELEASE_PERSPECTIVE}),
    )
  })

  it('lets a call override the perspective from context', () => {
    const {result} = setup(PerspectiveWrapper)

    result.current.createComment({...CREATE, message: MESSAGE, perspective: 'published'})

    expect(createComment).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({perspective: 'published'}),
    )
  })
})
