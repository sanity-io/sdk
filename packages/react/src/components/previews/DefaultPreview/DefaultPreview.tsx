import {isImageSource} from '@sanity/asset-utils'
// import {type SanityImageSource} from '@sanity/image-url/lib/types/types'
import {type SanityImageSource} from '@sanity/asset-utils'
import {DocumentIcon} from '@sanity/icons'
import imageUrlBuilder from '@sanity/image-url'
import {type ImageUrlFitMode} from '@sanity/types'
import {
  type ComponentType,
  createElement,
  type ElementType,
  isValidElement,
  type ReactElement,
  type ReactNode,
  useCallback,
  useMemo,
} from 'react'
import {isValidElementType} from 'react-is'

import {useClient} from '../../../hooks/client/useClient'
import {isString} from '../../../util/isString'
import {Tooltip} from '../../UIComponents/Tooltip/Tooltip'
import {type PreviewProps} from '../types'
import {DefaultPreviewLayout} from './layouts/DefaultPreviewLayout'

function FallbackIcon() {
  return <DocumentIcon className="sanity-studio__preview-fallback-icon" />
}

/** @internal */
export interface SanityDefaultPreviewProps extends Omit<PreviewProps, 'renderDefault'> {
  error?: Error | null
  icon?: ElementType | false
  tooltip?: ReactNode
}

/**
 * Used in cases where no custom preview component is provided
 * @internal
 * */
export function DefaultPreview(props: SanityDefaultPreviewProps): ReactElement {
  const {icon, layout, media: mediaProp, imageUrl, title, tooltip, ...restProps} = props

  const client = useClient()
  const imageBuilder = useMemo(() => imageUrlBuilder(client), [client])

  // NOTE: This function exists because the previews provides options
  // for the rendering of the media (dimensions)
  const renderMedia = useCallback(
    (options: {
      dimensions: {width?: number; height?: number; fit: ImageUrlFitMode; dpr?: number}
    }) => {
      const {dimensions} = options

      // Handle sanity image
      return (
        <img
          alt={isString(title) ? title : undefined}
          referrerPolicy="strict-origin-when-cross-origin"
          src={
            imageBuilder
              .image(
                mediaProp as SanityImageSource /*will only enter this code path if it's compatible*/,
              )
              .width(dimensions.width || 100)
              .height(dimensions.height || 100)
              .fit(dimensions.fit)
              .dpr(dimensions.dpr || 1)
              .url() || ''
          }
        />
      )
    },
    [imageBuilder, mediaProp, title],
  )

  const renderIcon = useCallback(() => {
    return createElement(icon || FallbackIcon)
  }, [icon])

  const media = useMemo(() => {
    if (icon === false) {
      // Explicitly disabled
      return false
    }

    if (isValidElementType(mediaProp)) {
      return mediaProp
    }

    if (isValidElement(mediaProp)) {
      return mediaProp
    }

    if (isImageSource(mediaProp)) {
      return renderMedia
    }

    // Handle image urls
    if (isString(imageUrl)) {
      return (
        <img
          src={imageUrl}
          alt={isString(title) ? title : undefined}
          referrerPolicy="strict-origin-when-cross-origin"
        />
      )
    }

    // Render fallback icon
    return renderIcon
  }, [icon, imageUrl, mediaProp, renderIcon, renderMedia, title])

  const previewProps: Omit<PreviewProps, 'renderDefault'> = useMemo(
    () => ({
      ...restProps,
      // @todo: fix `TS2769: No overload matches this call.`
      media: media as any,
      title,
    }),
    [media, restProps, title],
  )

  /*
   * This lookup typically unlocks previews that would show up in Portable Text,
   * different kinds of previews for images, etc.
   * In the interest of trying to keep this code concise and deliver for the end of the cycle,
   * I'm defaulting to the "default" layout for now, which is what is used in document lists.
   * Please refer to https://github.com/sanity-io/sanity/blob/8a9d18fb4cb4b8405574251ea6465ede5522bf91/packages/sanity/src/core/preview/components/_previewComponents.ts
   * for the full implementation.
   */
  // const layoutComponent = _previewComponents[layout || 'default']

  const children = createElement(
    DefaultPreviewLayout as ComponentType<Omit<PreviewProps, 'renderDefault'>>,
    previewProps,
  )

  if (tooltip) {
    return (
      <Tooltip
        content={tooltip}
        disabled={!tooltip}
        fallbackPlacements={['top-end']}
        placement="bottom-end"
      >
        {/* Currently tooltips won't trigger without a wrapping element */}
        <div>{children}</div>
      </Tooltip>
    )
  }

  return children
}
