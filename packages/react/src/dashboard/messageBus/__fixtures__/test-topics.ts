import {type EventTopicDef, type StateTopicDef} from '../topics'

declare module '../topics' {
  interface Topics {
    'test.count': StateTopicDef<number>
    'test.token': StateTopicDef<string | null>
    'test.scheme': StateTopicDef<'light' | 'dark'>
    'test.suspending': StateTopicDef<string>
    'test.ping': EventTopicDef<{n: number}>
    'test.echo': EventTopicDef<{n: number}, {n: number}>
    'test.mint': EventTopicDef<void, string>
    'test.profile': StateTopicDef<{
      fullName: string
      tags: readonly string[]
    }>
    'test.greet': EventTopicDef<{fullName: string}, {salutation: string; language: string}>
  }
}
