import {type ComlinkStatus, useFrameConnection} from '@sanity/sdk-react'
import {Button, TextInput} from '@sanity/ui'
import {ReactElement, useEffect, useRef, useState} from 'react'
import {Box, Card, Flex, Text, VStack} from 'ui5'

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
    <PageLayout title="Comlink demo" subtitle="Explore comlink connections and fetch operations">
      <VStack gap={4}>
        <Box flexGrow={1}>
          <Flex>
            <Box paddingRight={4} style={{minWidth: 200, maxWidth: 250}}>
              <VStack gap={3}>
                <Card density="compact">
                  <Text size={1} weight="semibold">
                    Frames
                  </Text>
                </Card>
                <VStack gap={2}>
                  {frames.map((frameNum) => (
                    <Button
                      key={frameNum}
                      fontSize={1}
                      mode={selectedFrame === frameNum ? 'default' : 'ghost'}
                      onClick={() => setSelectedFrame(frameNum)}
                      text={`Frame ${frameNum}`}
                    />
                  ))}
                </VStack>
              </VStack>
            </Box>

            <Box flexGrow={1}>
              <VStack gap={4}>
                <Card density="compact">
                  <VStack gap={3}>
                    <Text size={1} weight="semibold">
                      Send message to frame
                    </Text>
                    <Flex gap={2}>
                      <Box flexGrow={1}>
                        <TextInput
                          fontSize={1}
                          ref={messageInputRef}
                          onKeyDown={(e) => e.key === 'Enter' && sendMessageToFramedApp()}
                          disabled={status !== 'connected'}
                        />
                      </Box>
                      <Button
                        fontSize={1}
                        text="Send"
                        tone="primary"
                        onClick={sendMessageToFramedApp}
                        disabled={status !== 'connected'}
                      />
                    </Flex>
                  </VStack>
                </Card>

                <Box>
                  <VStack gap={3}>
                    <Text size={1} weight="semibold">
                      Received Messages
                    </Text>
                    {receivedMessages.map((msg, idx) => (
                      <Card density="compact" key={idx}>
                        <VStack gap={2}>
                          <Text size={1} muted>
                            {msg.from}
                          </Text>
                          <Text>{msg.message}</Text>
                        </VStack>
                      </Card>
                    ))}
                  </VStack>
                </Box>
              </VStack>
            </Box>
          </Flex>
        </Box>

        <Box flexGrow={1}>
          <Card density="compact">
            <iframe
              ref={iframeRef}
              src={`/comlink-demo/frame${selectedFrame}`}
              style={{width: '100%', height: '600px', border: 'none'}}
              title={`Frame ${selectedFrame}`}
            />
          </Card>
        </Box>
      </VStack>
    </PageLayout>
  )
}

export default ParentApp
