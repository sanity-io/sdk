import {getImage} from '@sanity/asset-utils'
import {type DocumentHandle} from '@sanity/sdk'
import {usePreview} from '@sanity/sdk-react/hooks'
import {ReactElement, useRef} from 'react'
import {Button, Frame, Window, WindowContent, WindowHeader} from 'react95'

import {useImageUrlBuilder} from '../../utils/imageUrlBuilder'

interface AuthorDetailsProps {
  document: DocumentHandle
  onClose: () => void
}

export const AuthorDetails = ({document, onClose}: AuthorDetailsProps): ReactElement => {
  const ref = useRef(null)
  const [{title, subtitle, media}] = usePreview({document, ref})
  const builder = useImageUrlBuilder()

  let mediaUrl = null
  if (media) {
    const url = builder.image(getImage(media)).width(200).height(200).fit('crop').url()
    mediaUrl = url.toString()
  }

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          zIndex: 9998,
        }}
      />
      <Frame
        variant="outside"
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 9999,
          background: 'silver',
          width: 300,
        }}
        ref={ref}
      >
        <Window>
          <WindowHeader
            style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}
          >
            <span>{title || 'Untitled'}</span>
            <Button onClick={onClose} size="sm" square style={{marginRight: -6}}>
              <span style={{fontWeight: 'bold', transform: 'translateY(-1px)'}}>×</span>
            </Button>
          </WindowHeader>
          <WindowContent>
            <Frame
              variant="field"
              style={{
                padding: '16px',
                marginBottom: '16px',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              {mediaUrl ? (
                <img src={mediaUrl} alt={title} style={{maxWidth: '100%', height: 'auto'}} />
              ) : (
                <span role="img" aria-label="user" style={{fontSize: '64px'}}>
                  👤
                </span>
              )}
            </Frame>
            <Frame
              variant="field"
              style={{
                padding: '16px',
                marginBottom: '16px',
              }}
            >
              <p style={{marginBottom: '8px'}}>
                <strong>Name:</strong> {title || 'Untitled'}
              </p>
              {subtitle && (
                <p>
                  <strong>ID:</strong> {subtitle}
                </p>
              )}
            </Frame>
            <div style={{textAlign: 'right'}}>
              <Button onClick={onClose}>OK</Button>
            </div>
          </WindowContent>
        </Window>
      </Frame>
    </>
  )
}
