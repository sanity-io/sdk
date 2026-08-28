import {describe, expect, expectTypeOf, it} from 'vitest'

import {
  CanvasUrlBuilder,
  CoreApplicationUrlBuilder,
  type DashboardUrl,
  DashboardUrlBuilder,
  MediaLibraryUrlBuilder,
  type StudioIntentUrl,
  type StudioUrl,
  StudioUrlBuilder,
  type StudioWorkspaceUrl,
  urlFor,
} from './urlFor'

class ContentAgentDocumentUrlBuilder extends DashboardUrlBuilder {
  perspective(perspective: string): this {
    return this.setSearchParameter('perspective', perspective)
  }
}

class ContentAgentUrlBuilder extends DashboardUrlBuilder {
  static readonly namespace = 'content-agent'

  context(contextId: string): this {
    return this.append('contexts', contextId)
  }

  document(documentId: string): ContentAgentDocumentUrlBuilder {
    return this.transition(ContentAgentDocumentUrlBuilder, 'documents', documentId)
  }
}

class PersonaUrlBuilder extends DashboardUrlBuilder {
  static readonly namespace = 'persona'

  person(personId: string): this {
    return this.append('people', personId)
  }
}

describe('urlFor', () => {
  it('builds studio URLs', () => {
    expect(urlFor.studios().url()).toBe('/studio')
    expect(urlFor.studios('studio-1').url()).toBe('/studio/studio-1')
    expect(urlFor.studios('studio-1').workspace('default').url()).toBe('/studio/studio-1/default')
  })

  it('builds edit intent URLs', () => {
    expect(
      urlFor
        .studios('studio-1')
        .workspace('default')
        .intent('edit', {id: 'drafts.document-1', type: 'article'})
        .url(),
    ).toBe('/studio/studio-1/default/intent/edit/id=drafts.document-1;type=article/')

    expect(urlFor.studios('studio-1').intent('edit', {id: 'document-1', mode: 'focus'}).url()).toBe(
      '/studio/studio-1/intent/edit/id=document-1;mode=focus/',
    )
  })

  it('builds create and release intent URLs', () => {
    expect(
      urlFor.studios('studio-1').intent('create', {template: 'article', type: 'article'}).url(),
    ).toBe('/studio/studio-1/intent/create/template=article;type=article/')
    expect(urlFor.studios('studio-1').intent('release', {id: 'release-1'}).url()).toBe(
      '/studio/studio-1/intent/release/id=release-1/',
    )
  })

  it('adds perspectives and comments to intent URLs', () => {
    const intent = urlFor
      .studios('studio-1')
      .intent('edit', {id: 'document/1', type: 'press release'})

    expect(intent.perspective('release/1').url()).toBe(
      '/studio/studio-1/intent/edit/id=document%2F1;type=press%20release/?perspective=release%2F1',
    )
    expect(intent.comment('comment/1').url()).toBe(
      '/studio/studio-1/intent/edit/id=document%2F1;type=press%20release;inspect=sanity%2Fcomments;comment=comment%2F1/',
    )
  })

  it('replaces an earlier comment instead of stacking one', () => {
    expect(
      urlFor
        .studios('studio-1')
        .intent('edit', {id: 'document-1'})
        .comment('comment-1')
        .comment('comment-2')
        .url(),
    ).toBe(
      '/studio/studio-1/intent/edit/id=document-1;inspect=sanity%2Fcomments;comment=comment-2/',
    )
  })

  it('builds studio task URLs', () => {
    expect(urlFor.studios('studio-1').workspace('default').task('task/1').url()).toBe(
      '/studio/studio-1/default?selectedTask=task%2F1',
    )
    expect(urlFor.studios('studio-1').intent('edit', {id: 'document-1'}).task('task-1').url()).toBe(
      '/studio/studio-1/intent/edit/id=document-1/?selectedTask=task-1',
    )
  })

  it('builds arbitrary studio paths', () => {
    expect(urlFor.studios('studio-1').path('custom', 'document/1').url()).toBe(
      '/studio/studio-1/custom/document/1',
    )
    expect(urlFor.studios('studio-1').workspace('default').path('custom', 'document/1').url()).toBe(
      '/studio/studio-1/default/custom/document/1',
    )
  })

  it('builds app URLs', () => {
    expect(urlFor.applications().url()).toBe('/application')
    expect(urlFor.applications('app-1').url()).toBe('/application/app-1')
    expect(urlFor.applications('app-1').path('documents', 'document/1').url()).toBe(
      '/application/app-1/documents/document/1',
    )
  })

  it('builds media library URLs', () => {
    expect(urlFor.mediaLibrary().url()).toBe('/media')
    expect(urlFor.mediaLibrary().asset('asset/1').url()).toBe('/media/assets/asset%2F1')
    expect(urlFor.mediaLibrary().collection('collection/1').url()).toBe(
      '/media/collections/collection%2F1',
    )
  })

  it('builds canvas and home URLs', () => {
    expect(urlFor.canvas().document('document/1').url()).toBe('/canvas/doc/document%2F1')
    expect(urlFor.home().url()).toBe('/')
  })

  it('encodes route segments', () => {
    expect(urlFor.studios('studio/1').workspace('main space').url()).toBe(
      '/studio/studio%2F1/main%20space',
    )
  })

  it('returns relative and absolute URL forms', () => {
    const dashboardUrl = urlFor.applications('app-1')
    const absolute = new URL('/application/app-1', globalThis.location.origin)

    expect(dashboardUrl.toString()).toBe('/application/app-1')
    expect(dashboardUrl.toURL()).toEqual(absolute)
    expect(dashboardUrl.url({absolute: true})).toBe(absolute.href)
  })

  it('keeps builders immutable', () => {
    const intent = urlFor.studios('studio-1').intent('edit', {id: 'document-1'})

    intent.comment('comment-1')
    intent.perspective('release-1')

    expect(intent.url()).toBe('/studio/studio-1/intent/edit/id=document-1/')
  })

  it('extends the URL builder with custom builder classes', () => {
    const extendedUrlFor = urlFor.extend({contentAgent: ContentAgentUrlBuilder})
    const reextendedUrlFor = extendedUrlFor.extend({persona: PersonaUrlBuilder})

    expect(
      extendedUrlFor
        .contentAgent()
        .context('context/1')
        .document('document/1')
        .perspective('published')
        .url(),
    ).toBe('/content-agent/contexts/context%2F1/documents/document%2F1?perspective=published')
    expect(reextendedUrlFor.persona().person('person/1').url()).toBe('/persona/people/person%2F1')
    expect(reextendedUrlFor.contentAgent().url()).toBe('/content-agent')
    expect(urlFor).not.toHaveProperty('contentAgent')

    expectTypeOf(extendedUrlFor.contentAgent()).toEqualTypeOf<ContentAgentUrlBuilder>()
    expectTypeOf(
      extendedUrlFor.contentAgent().document('document-1'),
    ).toEqualTypeOf<ContentAgentDocumentUrlBuilder>()
    expectTypeOf(reextendedUrlFor.persona()).toEqualTypeOf<PersonaUrlBuilder>()
  })

  it('rejects duplicate URL namespaces', () => {
    expect(() => urlFor.extend({canvas: ContentAgentUrlBuilder} as never)).toThrow(
      'Dashboard URL namespace "canvas" already exists',
    )
  })

  it('covers the studio path grammar with path(), tools included', () => {
    expect(
      urlFor
        .studios('studio-1')
        .workspace('default')
        .path('structure', 'articles', 'article/1')
        .url(),
    ).toBe('/studio/studio-1/default/structure/articles/article/1')
  })

  it('exposes target-specific builder interfaces', () => {
    expectTypeOf(urlFor.studios('studio-1')).toEqualTypeOf<StudioUrl>()
    expectTypeOf(
      urlFor.studios('studio-1').workspace('default'),
    ).toEqualTypeOf<StudioWorkspaceUrl>()
    expectTypeOf(
      urlFor.studios('studio-1').intent('edit', {id: 'document-1'}),
    ).toEqualTypeOf<StudioIntentUrl>()
    expectTypeOf(urlFor.studios()).toEqualTypeOf<DashboardUrl>()
    expectTypeOf(urlFor.applications()).toEqualTypeOf<DashboardUrl>()
    expectTypeOf(urlFor.applications('app-1')).toEqualTypeOf<CoreApplicationUrlBuilder>()
    expectTypeOf(urlFor.mediaLibrary()).toEqualTypeOf<MediaLibraryUrlBuilder>()
    expectTypeOf(urlFor.canvas()).toEqualTypeOf<CanvasUrlBuilder>()
    expectTypeOf(urlFor.home()).toEqualTypeOf<DashboardUrl>()
    expect(urlFor.studios('studio-1')).toBeInstanceOf(StudioUrlBuilder)
  })
})
