import {type JSX} from 'react'
import {Link, useLocation} from 'react-router'
import {Text} from 'ui5'

/**
 * Switches between the legacy and the current comments page. Carries the query
 * string along, so `documentId` and `studio` still point at the same document
 * and the two stores can be compared side by side.
 */
export function CommentsStoreLink({to, label}: {to: string; label: string}): JSX.Element {
  const {search} = useLocation()

  return (
    <Text size={1}>
      <Link to={{pathname: to, search}} data-testid="comments-store-link">
        {label}
      </Link>
    </Text>
  )
}
