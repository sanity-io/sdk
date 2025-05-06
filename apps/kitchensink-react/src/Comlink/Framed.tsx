import {useWindowConnection} from '@sanity/sdk-react'
import {Box, Button, Card, Container, Label, Stack, Text, TextInput} from '@sanity/ui'
import {type ReactElement, Suspense, useEffect, useRef, useState} from 'react'

import {FromIFrameMessage, ToIFrameMessage, UserData} from './types'

// Extracted connection-dependent content
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

  // Fetch all users when connected
  useEffect(() => {
    if (!fetch) return

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
      <Stack space={3}>
        <Label>Send message to parent</Label>
        <Box display="flex">
          <Box flex={1}>
            <TextInput
              ref={messageInputRef}
              onKeyDown={(e) => e.key === 'Enter' && sendMessageToParent()}
            />
          </Box>
          <Button text="Send" tone="primary" onClick={sendMessageToParent} />
        </Box>
      </Stack>

      {/* Users section */}
      <Card padding={3} border radius={2}>
        <Stack space={3}>
          <Label>Users</Label>
          {users.length > 0 ? (
            <Stack space={2}>
              {users.map((user) => (
                <Card key={user.id} padding={3} tone="positive" radius={2}>
                  <Stack space={2}>
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
        <Stack space={3}>
          <Text weight="semibold">Received Messages</Text>
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
        <Stack padding={4} space={4}>
          <Text weight="semibold" size={2}>
            Frame Content
          </Text>
          <Suspense fallback={<div>Connecting to ParentApp...</div>}>
            <FramedContent />
          </Suspense>
        </Stack>
      </Card>
    </Container>
  )
}

export default Framed
