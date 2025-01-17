import {type Connection, createConnection} from '@sanity/comlink'
import {Button, Card, Flex, TextInput} from '@sanity/ui'
import {type FunctionComponent, useEffect, useRef, useState} from 'react'
import {Link} from 'react-router'

interface SendMessage {
  type: 'SET_TOKEN'
  data: {
    token: string
  }
  response?: undefined
}

interface ReceiveMessage {
  type: 'TOKEN_RECEIVED'
  data: {
    success: boolean
  }
  response?: undefined
}

export const Cosui: FunctionComponent = () => {
  const frameRef = useRef<HTMLIFrameElement | null>(null)
  const [token, setToken] = useState('')
  const [tokenSent, setTokenSent] = useState(false)
  const [connection, setConnection] = useState<Connection<SendMessage, ReceiveMessage> | null>(null)

  const loadToken = () => {
    if (!connection) return
    connection.post('SET_TOKEN', {
      token,
    })
    setTokenSent(true)
  }

  useEffect(() => {
    if (!frameRef.current) return

    const _connection = createConnection<SendMessage, ReceiveMessage>({
      name: 'cosui',
      connectTo: 'framed-app',
      targetOrigin: '*',
      heartbeat: true,
    })
    setConnection(_connection)

    // Listen for TOKEN_RECEIVED confirmation
    _connection.on('TOKEN_RECEIVED', (data) => {
      // eslint-disable-next-line no-console
      console.log('Received token confirmation:', data)
      return undefined
    })

    frameRef.current.onload = () => {
      _connection.setTarget(frameRef.current!.contentWindow!)
      _connection.start()
      _connection.connect()
    }

    return () => {
      _connection.disconnect()
      _connection.stop()
    }
  }, [])

  return (
    <div className="min-h-[20rem] w-1/2 flex-shrink-0 flex-grow">
      <Card shadow={1} padding={3}>
        <Flex align="center" justify="space-between" paddingX={4}>
          <p>COSUi Simulator</p>
          {tokenSent ? (
            <p>Below is the COSUi app loaded in a frame</p>
          ) : (
            <p>Enter a token to load the COSUi app →</p>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault()
              loadToken()
            }}
          >
            <Flex gap={2}>
              <TextInput
                placeholder="Enter token"
                type="password"
                autoComplete="off"
                value={token}
                onChange={(e) => setToken(e.currentTarget.value)}
                disabled={!connection}
              />
              <Button type="submit" mode="ghost" tone="primary" text="Load token" />
            </Flex>
          </form>
          <Flex gap={2}>
            <Link to="/" style={{textDecoration: 'none'}}>
              <Button mode="ghost" tone="primary" text="← Back to Home" />
            </Link>
          </Flex>
        </Flex>
      </Card>
      <iframe
        src="/cosui-app"
        className="m-0 h-full w-full rounded-lg p-0"
        ref={frameRef}
        title={'framed-app'}
        width="100%"
        height="100%"
      />
    </div>
  )
}
