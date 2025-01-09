import {useFrameConnection} from '@sanity/sdk-react/hooks'
import {Box, Button, Card, Container, Label, Stack, Text, TextInput} from '@sanity/ui'
import {ReactElement, useEffect, useState} from 'react'

type DemoFrameMessage = {
  type: 'FRAME_MESSAGE'
  data: {message: string}
}

type DemoWindowMessage = {
  type: 'WINDOW_MESSAGE'
  data: {message: string}
}

const Frame = (): ReactElement => {
  const [message, setMessage] = useState('')
  const [receivedMessages, setReceivedMessages] = useState<string[]>([])

  const frameConnection = useFrameConnection<DemoFrameMessage, DemoWindowMessage>({
    name: 'frame',
    connectTo: 'main-app',
    targetOrigin: '*',
    onMessage: {
      WINDOW_MESSAGE: (data) => {
        setReceivedMessages((prev) => [...prev, data.message])
      },
    },
  })

  useEffect(() => {
    const cleanup = frameConnection.connect(window.parent)
    return cleanup
  }, [frameConnection])

  const sendMessage = () => {
    if (message.trim()) {
      frameConnection.sendMessage('FRAME_MESSAGE', {message})
      setMessage('')
    }
  }

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
                  onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                />
              </Box>
              <Button text="Send" tone="primary" onClick={sendMessage} />
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

export default Frame
