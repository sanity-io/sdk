import {type EventTopicDef, type StateTopicDef} from '../topics'

// Test-only topics, declared once (augmentation is global) via tsconfig
// include. Excluded from the published package.
declare module '../topics' {
  interface Topics {
    'test.count': StateTopicDef<number>
    'test.token': StateTopicDef<string | null>
    'test.scheme': StateTopicDef<'light' | 'dark'>
    'test.suspending': StateTopicDef<string>
    'test.ping': EventTopicDef<{n: number}>
    'test.echo': EventTopicDef<{n: number}, {n: number}>
    // A void-payload request topic: no payload argument, still replies.
    'test.mint': EventTopicDef<void, string>
    // Latest shapes for the cross-version adaptation tests.
    'test.profile': StateTopicDef<{
      fullName: string
      tags: readonly string[]
    }>
    'test.greet': EventTopicDef<{fullName: string}>
  }
}
