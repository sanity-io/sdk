import {describe, expect, expectTypeOf, it} from 'vitest'

import {
  type CanvasUrl,
  type CoreApplicationUrl,
  type MediaLibraryUrl,
  type StudioIntentUrl,
  type StudioUrl,
  type StudioWorkspaceUrl,
  type Url,
  UrlBuilder,
  urlFor,
} from './urlFor'

class ContentAgentDocumentUrlBuilder extends UrlBuilder {
  perspective(perspective: string): this {
    return this.edit((url) => url.searchParams.set('perspective', perspective))
  }

  panel(panelId: string): this {
    return this.edit((url) => {
      url.hash = `panel/${panelId}`
    })
  }
}

class ContentAgentUrlBuilder extends UrlBuilder {
  static readonly namespace = 'content-agent'

  context(contextId: string): this {
    return this.append('contexts', contextId)
  }

  document(documentId: string): ContentAgentDocumentUrlBuilder {
    return this.transitionTo(ContentAgentDocumentUrlBuilder, 'documents', documentId)
  }
}

class PersonaUrlBuilder extends UrlBuilder {
  static readonly namespace = 'persona'

  person(personId: string): this {
    return this.append('people', personId)
  }
}

class CanvasAliasUrlBuilder extends UrlBuilder {
  static readonly namespace = 'canvas'
}

describe('studio', () => {
  it('builds studio URLs', () => {
    expect(urlFor.studios().url()).toBe('/studios')
    expect(urlFor.studios('studio-1').url()).toBe('/studios/studio-1')
    expect(urlFor.studios('studio-1').workspace('default').url()).toBe('/studios/studio-1/default')
  })

  it('builds edit intent URLs', () => {
    expect(
      urlFor
        .studios('studio-1')
        .workspace('default')
        .intent('edit', {id: 'drafts.document-1', type: 'article'})
        .url(),
    ).toBe('/studios/studio-1/default/intent/edit/id=drafts.document-1;type=article/')

    expect(urlFor.studios('studio-1').intent('edit', {id: 'document-1', mode: 'focus'}).url()).toBe(
      '/studios/studio-1/intent/edit/id=document-1;mode=focus/',
    )
  })

  it('builds create and release intent URLs', () => {
    expect(
      urlFor.studios('studio-1').intent('create', {template: 'article', type: 'article'}).url(),
    ).toBe('/studios/studio-1/intent/create/template=article;type=article/')
    expect(urlFor.studios('studio-1').intent('release', {id: 'release-1'}).url()).toBe(
      '/studios/studio-1/intent/release/id=release-1/',
    )
  })

  it('adds perspectives and comments to intent URLs', () => {
    const intent = urlFor
      .studios('studio-1')
      .intent('edit', {id: 'document/1', type: 'press release'})

    expect(intent.perspective('release/1').url()).toBe(
      '/studios/studio-1/intent/edit/id=document%2F1;type=press%20release/?perspective=release%2F1',
    )
    expect(intent.comment('comment/1').url()).toBe(
      '/studios/studio-1/intent/edit/id=document%2F1;type=press%20release;inspect=sanity%2Fcomments;comment=comment%2F1/',
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
      '/studios/studio-1/intent/edit/id=document-1;inspect=sanity%2Fcomments;comment=comment-2/',
    )
  })

  it('builds studio task URLs', () => {
    expect(urlFor.studios('studio-1').workspace('default').task('task/1').url()).toBe(
      '/studios/studio-1/default?selectedTask=task%2F1',
    )
    expect(urlFor.studios('studio-1').intent('edit', {id: 'document-1'}).task('task-1').url()).toBe(
      '/studios/studio-1/intent/edit/id=document-1/?selectedTask=task-1',
    )
  })

  it('builds arbitrary studio paths', () => {
    expect(urlFor.studios('studio-1').path('custom', 'document/1').url()).toBe(
      '/studios/studio-1/custom/document/1',
    )
  })

  it('encodes studio and workspace identifiers', () => {
    expect(urlFor.studios('studio/1').workspace('main space').url()).toBe(
      '/studios/studio%2F1/main%20space',
    )
  })

  it('exposes studio-specific builder interfaces', () => {
    expectTypeOf(urlFor.studios()).toEqualTypeOf<Url>()
    expectTypeOf(urlFor.studios('studio-1')).toEqualTypeOf<StudioUrl>()
    expectTypeOf(
      urlFor.studios('studio-1').workspace('default'),
    ).toEqualTypeOf<StudioWorkspaceUrl>()
    expectTypeOf(
      urlFor.studios('studio-1').intent('edit', {id: 'document-1'}),
    ).toEqualTypeOf<StudioIntentUrl>()
  })
})

describe('coreApp', () => {
  it('builds collection and application URLs', () => {
    expect(urlFor.applications().url()).toBe('/applications')
    expect(urlFor.applications('app-1').url()).toBe('/application/app-1')
    expect(urlFor.applications('app-1').path('documents', 'document/1').url()).toBe(
      '/application/app-1/documents/document/1',
    )
  })

  it('exposes application-specific builder interfaces', () => {
    expectTypeOf(urlFor.applications()).toEqualTypeOf<Url>()
    expectTypeOf(urlFor.applications('app-1')).toEqualTypeOf<CoreApplicationUrl>()
  })
})

describe('Media Library and Canvas', () => {
  it('builds media library URLs', () => {
    expect(urlFor.mediaLibrary().url()).toBe('/media')
    expect(urlFor.mediaLibrary().asset('asset/1').url()).toBe('/media/assets/asset%2F1')
    expect(urlFor.mediaLibrary().collection('collection/1').url()).toBe(
      '/media/collections/collection%2F1',
    )
  })

  it('builds Canvas URLs', () => {
    expect(urlFor.canvas().document('document/1').url()).toBe('/canvas/doc/document%2F1')
  })

  it('exposes singleton-specific builder interfaces', () => {
    expectTypeOf(urlFor.mediaLibrary()).toEqualTypeOf<MediaLibraryUrl>()
    expectTypeOf(urlFor.canvas()).toEqualTypeOf<CanvasUrl>()
  })
})

describe('UrlBuilder', () => {
  it('returns relative and absolute URL forms', () => {
    const origin = 'https://dashboard.sanity.io'
    const builder = new UrlBuilder(new URL('/application/app-1', origin))
    const absolute = new URL('/application/app-1', origin)

    expect(builder.toString()).toBe('/application/app-1')
    expect(builder.url()).toBe('/application/app-1')
    expect(builder.toURL({origin})).toEqual(absolute)
    expect(builder.url({origin})).toBe(absolute.href)
  })

  it('keeps builders immutable', () => {
    const builder = new ContentAgentUrlBuilder(new URL('https://dashboard.sanity.io/content-agent'))

    builder.context('context-1')

    expect(builder.url()).toBe('/content-agent')
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
        .panel('review 1')
        .url(),
    ).toBe(
      '/content-agent/contexts/context%2F1/documents/document%2F1?perspective=published#panel/review%201',
    )
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
    const extendedUrlFor = urlFor.extend({contentAgent: ContentAgentUrlBuilder})

    expect(() => urlFor.extend({canvas: ContentAgentUrlBuilder} as never)).toThrow(
      'URL builder "canvas" already exists',
    )
    expect(() => urlFor.extend({canvasAlias: CanvasAliasUrlBuilder})).toThrow(
      'URL namespace "canvas" already exists',
    )
    expect(() => extendedUrlFor.extend({agent: ContentAgentUrlBuilder})).toThrow(
      'URL namespace "content-agent" already exists',
    )
    expect(() =>
      urlFor.extend({agent: ContentAgentUrlBuilder, assistant: ContentAgentUrlBuilder}),
    ).toThrow('URL namespace "content-agent" already exists')
  })

  it('builds the home URL', () => {
    expect(urlFor.home().url()).toBe('/')
    expectTypeOf(urlFor.home()).toEqualTypeOf<Url>()
  })
})
