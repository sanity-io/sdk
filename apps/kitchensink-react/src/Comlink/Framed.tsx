import {useWindowConnection} from '@sanity/sdk-react/hooks'
import {Box, Button, Card, Container, Label, Stack, Text, TextInput} from '@sanity/ui'
import {ReactElement, useCallback, useState} from 'react'

import {FromIFrameMessage, ToIFrameMessage} from './types'

const Framed = (): ReactElement => {
  const [message, setMessage] = useState('')
  const [receivedMessages, setReceivedMessages] = useState<string[]>([])

  const {sendMessage, status} = useWindowConnection<FromIFrameMessage, ToIFrameMessage>({
    name: 'frame',
    connectTo: 'main-app',
    onMessage: {
      TO_IFRAME: (data: {message: string}) => {
        setReceivedMessages((prev) => [...prev, data.message])
      },
    },
  })

  const sendMessageToParent = useCallback(() => {
    if (message.trim()) {
      sendMessage('FROM_IFRAME', {message})
      setMessage('')
    }
  }, [message, sendMessage])

  return (
    <Container height={'fill'}>
      <Card tone="transparent">
        <Stack padding={4} space={4}>
          <Text weight="semibold" size={2}>
            Frame Content
          </Text>

          {/* Message input */}
          <Stack space={3}>
            <Label>Send message to parent</Label>
            <Box display="flex">
              <Box flex={1}>
                <TextInput
                  value={message}
                  onChange={(event) => setMessage(event.currentTarget.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendMessageToParent()}
                  disabled={status !== 'connected'}
                />
              </Box>
              <Button
                text="Send"
                tone="primary"
                onClick={sendMessageToParent}
                disabled={status !== 'connected'}
              />
            </Box>
          </Stack>

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
        </Stack>
      </Card>
    </Container>
  )
}

export default Framed
