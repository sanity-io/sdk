import {Flex, Text} from '@sanity/ui'
import {useEffect, useLayoutEffect, useRef, useState} from 'react'

interface LoadMoreProps {
  // Whether a fetch is currently in flight (renders a "Loading…" hint).
  isPending?: boolean
  // Whether there are more items to load. When false, reaching the sentinel
  // does nothing.
  hasMore: boolean
  // Called when the sentinel scrolls into view and `hasMore` is still true.
  onLoadMore: () => void
  // Element the sentinel renders as. Defaults to `li` for use inside an `ol`/
  // `ul`; pass `div` when rendering outside a list (e.g. inside a Stack).
  as?: React.ElementType | keyof React.JSX.IntrinsicElements
}

/**
 * Infinite-scroll sentinel for progressively loaded lists (`useDocuments`,
 * `useUsers`, …). Render it as the last child of a scrollable list: when it
 * scrolls into view it calls `onLoadMore`, so pages load automatically as the
 * user scrolls rather than via a "Load more" button.
 */
export function LoadMore({
  onLoadMore,
  hasMore,
  isPending,
  as = 'li',
}: LoadMoreProps): React.ReactNode {
  const ref = useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = useState(false)

  // Track whether the sentinel is currently intersecting the viewport.
  useEffect(() => {
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      setIsVisible(entry.isIntersecting)
    })

    if (ref.current) intersectionObserver.observe(ref.current)
    return () => intersectionObserver.disconnect()
  }, [])

  // `hasMore` and `onLoadMore` are mirrored into refs so the load effect below
  // depends only on `isVisible`. Otherwise a new `onLoadMore` identity or a
  // `hasMore` flip would re-run the effect and could double-fire a fetch.
  const hasMoreRef = useRef(hasMore)
  useLayoutEffect(() => {
    hasMoreRef.current = hasMore
  }, [hasMore])

  const loadMoreRef = useRef(onLoadMore)
  useEffect(() => {
    if (hasMoreRef.current && isVisible) loadMoreRef.current?.()
  }, [isVisible])

  return (
    <Flex as={as} style={{height: 12}} ref={ref} flex="auto" justify="center" padding={3}>
      {isPending && <Text>Loading…</Text>}
    </Flex>
  )
}
