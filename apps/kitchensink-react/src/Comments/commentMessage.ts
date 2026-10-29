import {randomUuid} from '@sanity/sdk/_internal'
import {type CommentMessage} from '@sanity/sdk-react/collaboration'

/** Wraps plain text as the Portable Text a comment message has to be. */
export function toMessage(text: string): CommentMessage {
  return [
    {
      _type: 'block',
      _key: randomUuid(),
      style: 'normal',
      markDefs: [],
      children: [{_type: 'span', _key: randomUuid(), text, marks: []}],
    },
  ]
}

/** Flattens a message for display. Mentions render as nothing, which is fine here. */
export function toPlainText(message: CommentMessage): string {
  return message
    .map((block) => {
      const children = (block as {children?: {text?: string}[]}).children ?? []
      return children.map((child) => child.text ?? '').join('')
    })
    .join('\n')
}
