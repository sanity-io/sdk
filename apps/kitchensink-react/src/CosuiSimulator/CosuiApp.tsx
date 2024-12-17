import {createNode} from '@sanity/comlink'
import {useEffect, useState} from 'react'

import {CosuiSimWrapper} from './CosuiSimWrapper'

interface ReceiveMessage {
  type: 'SET_TOKEN'
  data: {
    token: string
  }
  response?: undefined
}

interface SendMessage {
  type: 'TOKEN_RECEIVED'
  data: {
    success: boolean
  }
  response?: undefined
}

export default function CosuiApp(): React.ReactNode {
  const [token, setToken] = useState<string>()

  useEffect(() => {
    const node = createNode<SendMessage, ReceiveMessage>({
      name: 'framed-app',
      connectTo: 'cosui',
    })

    node.on('SET_TOKEN', (data) => {
      setToken(data.token)
      node.post('TOKEN_RECEIVED', {
        success: true,
      })
      return undefined
    })

    node.start()

    return () => {
      node.stop()
    }
  }, [])

  return <CosuiSimWrapper token={token} />
}
