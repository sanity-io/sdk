import {useWindowConnection} from '@sanity/sdk-react'
import {Button, TextInput} from '@sanity/ui'
import {type ReactElement, Suspense, useEffect, useRef, useState} from 'react'
import {Box, Card, Container, Flex, Text, VStack} from 'ui5'

import {FromIFrameMessage, ToIFrameMessage, UserData} from './types'

function FramedContent() {
  const [receivedMessages, setReceivedMessages] = useState<string[]>([])
  const [users, setUsers] = useState<UserData[]>([])
  const [error, setError] = useState<string | null>(null)

  const messageInputRef = useRef<HTMLInputElement>(null)

  const {sendMessage, fetch} = useWindowConnection<FromIFrameMessage, ToIFrameMessage>({
    name: 'frame',
    connectTo: 'main-app',
    onMessage: {
      TO_IFRAME: (data: {message: string}) => {
        setReceivedMessages((prev) => [...prev, data.message])
      },
    },
  })

  useEffect(() => {
    async function fetchUsers(signal: AbortSignal) {
      try {
        const data = await fetch<UserData[]>('FETCH_USERS', undefined, {signal})
        setUsers(data)
        setError(null)
      } catch (err) {
        if (err?.name !== 'AbortError') {
          setError('Failed to fetch users')
        }
      }
    }

    const controller = new AbortController()
    fetchUsers(controller.signal)

    return () => {
      controller.abort()
    }
  }, [fetch])

  const sendMessageToParent = () => {
    const message = messageInputRef.current?.value || ''
    if (message.trim()) {
      sendMessage('FROM_IFRAME', {message})
      if (messageInputRef.current) {
        messageInputRef.current.value = ''
      }
    }
  }

  return (
    <>
      <VStack gap={3}>
        <Text size={1} weight="semibold">
          Send message to parent
        </Text>
        <Flex gap={2}>
          <Box flexGrow={1}>
            <TextInput
              fontSize={1}
              ref={messageInputRef}
              onKeyDown={(e) => e.key === 'Enter' && sendMessageToParent()}
            />
          </Box>
          <Button fontSize={1} text="Send" tone="primary" onClick={sendMessageToParent} />
        </Flex>
      </VStack>

      <Card density="regular">
        <VStack gap={3}>
          <Text size={1} weight="semibold">
            Users
          </Text>
          {users.length > 0 ? (
            <VStack gap={2}>
              {users.map((user) => (
                <Card density="compact" key={user.id} tone="positive">
                  <VStack gap={2}>
                    <Text size={1} weight="semibold">
                      {user.name}
                    </Text>
                    <Text size={1}>{user.email}</Text>
                  </VStack>
                </Card>
              ))}
            </VStack>
          ) : error ? (
            <Card density="compact" tone="critical">
              <Text size={1}>{error}</Text>
            </Card>
          ) : (
            <Card density="compact">
              <Text size={1}>Loading users...</Text>
            </Card>
          )}
        </VStack>
      </Card>

      <Box flexGrow={1} style={{height: '500px'}}>
        <VStack gap={3}>
          <Text size={1} weight="semibold">
            Received Messages
          </Text>
          {receivedMessages.map((msg, idx) => (
            <Card density="compact" key={idx}>
              <Text>{msg}</Text>
            </Card>
          ))}
        </VStack>
      </Box>
    </>
  )
}

const Framed = (): ReactElement => {
  return (
    <Container>
      <Box padding={4}>
        <VStack gap={4}>
          <Text weight="semibold" size={1}>
            Frame Content
          </Text>
          <Suspense fallback={<Text size={1}>Connecting to ParentApp...</Text>}>
            <FramedContent />
          </Suspense>
        </VStack>
      </Box>
    </Container>
  )
}

export default Framed
