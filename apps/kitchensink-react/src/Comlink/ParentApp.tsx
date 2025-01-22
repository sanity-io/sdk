import {useWindowConnection} from '@sanity/sdk-react/hooks'
import {Box, Button, Card, Label, Stack, Text, TextInput} from '@sanity/ui'
import {ReactElement, useState} from 'react'

import {PageLayout} from '../components/PageLayout'

type DemoFrameMessage = {
  type: 'FRAME_MESSAGE'
  data: {message: string}
}

type DemoWindowMessage = {
  type: 'WINDOW_MESSAGE'
  data: {message: string}
}

const ParentApp = (): ReactElement => {
  const [selectedFrame, setSelectedFrame] = useState<number>(1)
  const [message, setMessage] = useState('')
  const [receivedMessages, setReceivedMessages] = useState<Array<{from: string; message: string}>>(
    [],
  )

  const windowConnection = useWindowConnection<DemoWindowMessage, DemoFrameMessage>({
    name: 'main-app',
    connectTo: 'frame',
    onMessage: {
      FRAME_MESSAGE: (data) => {
        setReceivedMessages((prev) => [
          ...prev,
          {from: `Frame ${selectedFrame}`, message: data.message},
        ])
      },
    },
  })

  const sendMessage = () => {
    if (message.trim()) {
      windowConnection.sendMessage('WINDOW_MESSAGE', {message})
      setMessage('')
    }
  }

  const frames = [1, 2, 3]

  return (
    <PageLayout
      title="Comlink demo"
      subtitle="Explore comlink connections"
      homePath="/comlink-demo"
      homeText="Comlink Demo Home"
    >
      <Stack space={4} height="fill">
        <Box flex={1}>
          <Box display="flex" height="fill">
            {/* Frame Navigation */}
            <Box paddingRight={4} style={{minWidth: 200, maxWidth: 250}}>
              <Stack space={3}>
                <Card padding={3}>
                  <Text size={2} weight="semibold">
                    Frames
                  </Text>
                </Card>
                <Stack space={2}>
                  {frames.map((frameNum) => (
                    <Button
                      key={frameNum}
                      mode={selectedFrame === frameNum ? 'default' : 'ghost'}
                      onClick={() => setSelectedFrame(frameNum)}
                      text={`Frame ${frameNum}`}
                    />
                  ))}
                </Stack>
              </Stack>
            </Box>

            {/* Parent App Controls */}
            <Box flex={1}>
              <Stack space={4}>
                {/* Message input */}
                <Card padding={3}>
                  <Stack space={3}>
                    <Label>Send message to frame</Label>
                    <Box display="flex">
                      <Box flex={1}>
                        <TextInput
                          value={message}
                          onChange={(event) => setMessage(event.currentTarget.value)}
                          onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                        />
                      </Box>
                      <Button text="Send" tone="primary" onClick={sendMessage} />
                    </Box>
                  </Stack>
                </Card>

                {/* Messages display */}
                <Box>
                  <Stack space={3}>
                    <Text weight="semibold">Received Messages</Text>
                    {receivedMessages.map((msg, idx) => (
                      <Card key={idx} padding={3} radius={2}>
                        <Stack space={2}>
                          <Text size={1} muted>
                            {msg.from}
                          </Text>
                          <Text>{msg.message}</Text>
                        </Stack>
                      </Card>
                    ))}
                  </Stack>
                </Box>
              </Stack>
            </Box>
          </Box>
        </Box>

        {/* Frame Display */}
        <Box flex={1} height="fill">
          <Card padding={3} height="fill" tone="transparent">
            <iframe
              src={`/comlink-demo/frame${selectedFrame}`}
              style={{width: '100%', height: '600px', border: 'none'}}
              title={`Frame ${selectedFrame}`}
            />
          </Card>
        </Box>
      </Stack>
    </PageLayout>
  )
}

export default ParentApp
