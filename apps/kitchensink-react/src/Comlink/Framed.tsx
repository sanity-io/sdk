import {useWindowConnection} from '@sanity/sdk-react'
import {Box, Button, Card, Container, Flex, Stack, Text, TextInput} from '@sanity/ui'
import {type ReactElement, Suspense, useEffect, useRef, useState} from 'react'

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
      <Stack gap={3}>
        <Text size={1} weight="semibold">
          Send message to parent
        </Text>
        <Flex gap={2}>
          <Box flex={1}>
            <TextInput
              fontSize={1}
              ref={messageInputRef}
              onKeyDown={(e) => e.key === 'Enter' && sendMessageToParent()}
            />
          </Box>
          <Button fontSize={1} text="Send" tone="primary" onClick={sendMessageToParent} />
        </Flex>
      </Stack>

      {/* Users section */}
      <Card padding={3} border radius={2}>
        <Stack gap={3}>
          <Text size={1} weight="semibold">
            Users
          </Text>
          {users.length > 0 ? (
            <Stack gap={2}>
              {users.map((user) => (
                <Card key={user.id} padding={3} tone="positive" radius={2}>
                  <Stack gap={2}>
                    <Text size={1} weight="semibold">
                      {user.name}
                    </Text>
                    <Text size={1}>{user.email}</Text>
                  </Stack>
                </Card>
              ))}
            </Stack>
          ) : error ? (
            <Card padding={3} tone="critical" radius={2}>
              <Text size={1}>{error}</Text>
            </Card>
          ) : (
            <Card padding={3} tone="default" radius={2}>
              <Text size={1}>Loading users...</Text>
            </Card>
          )}
        </Stack>
      </Card>

      {/* Received messages */}
      <Box flex={1} style={{height: '500px'}}>
        <Stack gap={3}>
          <Text size={1} weight="semibold">
            Received Messages
          </Text>
          {receivedMessages.map((msg, idx) => (
            <Card key={idx} padding={3} radius={2}>
              <Text>{msg}</Text>
            </Card>
          ))}
        </Stack>
      </Box>
    </>
  )
}

const Framed = (): ReactElement => {
  return (
    <Container height="fill">
      <Card tone="transparent">
        <Stack padding={4} gap={4}>
          <Text weight="semibold" size={1}>
            Frame Content
          </Text>
          <Suspense fallback={<Text size={1}>Connecting to ParentApp...</Text>}>
            <FramedContent />
          </Suspense>
        </Stack>
      </Card>
    </Container>
  )
}

export default Framed
