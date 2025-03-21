import {type ComlinkStatus, useFrameConnection} from '@sanity/sdk-react'
import {Box, Button, Card, Label, Stack, Text, TextInput} from '@sanity/ui'
import {ReactElement, useEffect, useRef, useState} from 'react'

import {PageLayout} from '../components/PageLayout'
import {FetchUsersRequest, FromIFrameMessage, ToIFrameMessage, UserData} from './types'

// Add this mock data
const MOCK_USERS: Record<string, UserData> = {
  1: {id: '1', name: 'Alice Johnson', email: 'alice@example.com'},
  2: {id: '2', name: 'Bob Smith', email: 'bob@example.com'},
  3: {id: '3', name: 'Carol Williams', email: 'carol@example.com'},
}

const ParentApp = (): ReactElement => {
  const [selectedFrame, setSelectedFrame] = useState<number>(1)
  const [status, setStatus] = useState<ComlinkStatus>('idle')
  const [receivedMessages, setReceivedMessages] = useState<Array<{from: string; message: string}>>(
    [],
  )

  const messageInputRef = useRef<HTMLInputElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const {sendMessage, connect} = useFrameConnection<
    ToIFrameMessage,
    FromIFrameMessage | FetchUsersRequest
  >({
    name: 'main-app',
    connectTo: 'frame',
    targetOrigin: '*',
    onStatus: setStatus,
    heartbeat: true,
    onMessage: {
      FROM_IFRAME: (data: {message: string}) => {
        setReceivedMessages((prev) => [
          ...prev,
          {from: `Frame ${selectedFrame}`, message: data.message},
        ])
      },
      FETCH_USERS: () => {
        return Object.values(MOCK_USERS)
      },
    },
  })

  const sendMessageToFramedApp = () => {
    const message = messageInputRef.current?.value || ''
    if (message.trim()) {
      sendMessage('TO_IFRAME', {message})
      if (messageInputRef.current) {
        messageInputRef.current.value = ''
      }
    }
  }

  useEffect(() => {
    let cleanupIframeConnection: (() => void) | undefined

    const handleIframeLoad = () => {
      if (iframeRef.current?.contentWindow) {
        // Call previous cleanup if it exists for some reason
        cleanupIframeConnection?.()
        // Store new cleanup function
        cleanupIframeConnection = connect(iframeRef.current.contentWindow)
      }
    }

    const iframe = iframeRef.current
    // on a new frame, connect and return a cleanup function
    if (iframe) {
      iframe.addEventListener('load', handleIframeLoad)

      return () => {
        cleanupIframeConnection?.()
        iframe.removeEventListener('load', handleIframeLoad)
      }
    }
    // on unmount, cleanup the connection
    return () => {
      cleanupIframeConnection?.()
    }
  }, [connect, selectedFrame])

  const frames = [1, 2, 3]

  return (
    <PageLayout
      title="Comlink demo"
      subtitle="Explore comlink connections and fetch operations"
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
                          ref={messageInputRef}
                          onKeyDown={(e) => e.key === 'Enter' && sendMessageToFramedApp()}
                          disabled={status !== 'connected'}
                        />
                      </Box>
                      <Button
                        text="Send"
                        tone="primary"
                        onClick={sendMessageToFramedApp}
                        disabled={status !== 'connected'}
                      />
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
              ref={iframeRef}
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
