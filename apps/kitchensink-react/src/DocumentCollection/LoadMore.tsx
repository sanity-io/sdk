import {Flex, Text} from '@sanity/ui'
import {useEffect, useLayoutEffect, useRef, useState} from 'react'

interface LoadMoreProps {
  isPending?: boolean
  hasMore: boolean
  onLoadMore: () => void
}

export function LoadMore({onLoadMore, hasMore, isPending}: LoadMoreProps): React.ReactNode {
  const ref = useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      setIsVisible(entry.isIntersecting)
    })

    if (ref.current) intersectionObserver.observe(ref.current)
    return () => intersectionObserver.disconnect()
  }, [])

  // don't want `hasMore` affecting the useEffect below
  // so we wrap and sync it in a non-reactive ref
  const hasMoreRef = useRef(hasMore)
  useLayoutEffect(() => {
    hasMoreRef.current = hasMore
  }, [hasMore])

  const loadMoreRef = useRef(onLoadMore)
  useEffect(() => {
    if (hasMoreRef.current && isVisible) loadMoreRef.current?.()
  }, [isVisible])

  return (
    <Flex as="li" style={{height: 12}} ref={ref} flex="auto" justify="center" padding={3}>
      {isPending && <Text>Loading…</Text>}
    </Flex>
  )
}
