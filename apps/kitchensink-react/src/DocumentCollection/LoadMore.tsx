import {Flex, Text} from '@sanity/ui'
import {useEffect, useRef, useState} from 'react'

interface LoadMoreProps {
  isPending: boolean
  onLoadMore: () => void
}

export function LoadMore({onLoadMore, isPending}: LoadMoreProps): React.ReactNode {
  const ref = useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      setIsVisible(entry.isIntersecting)
    })

    if (ref.current) intersectionObserver.observe(ref.current)
    return () => intersectionObserver.disconnect()
  }, [])

  const loadMoreRef = useRef(onLoadMore)

  useEffect(() => {
    if (isVisible) loadMoreRef.current?.()
  }, [isVisible])

  return (
    <Flex as="li" style={{height: 12}} ref={ref} flex="auto" justify="center" padding={3}>
      {isPending && <Text>Loading…</Text>}
    </Flex>
  )
}
