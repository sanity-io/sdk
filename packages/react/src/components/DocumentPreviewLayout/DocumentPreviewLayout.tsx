import 'inter-ui/inter.css'
import '../../css/styles.css'

import {DocumentIcon} from '@sanity/icons'
import {forwardRef} from 'react'

/**
 * @public
 */
export interface DocumentPreviewLayoutProps {
  docType?: string
  media?: {type: string; url: string} | null | undefined
  onClick?: () => void
  selected?: boolean
  status?: string
  subtitle?: string
  title: string
}

/**
 * This is a component that renders a document preview.
 *
 * @public
 *
 * @param props - The props for the DocumentPreviewLayout component.
 * @returns - The DocumentPreviewLayout component.
 */
export const DocumentPreviewLayout = forwardRef(
  (
    {
      docType,
      media,
      onClick,
      selected = false,
      status = '',
      subtitle = '',
      title,
    }: DocumentPreviewLayoutProps,
    ref: React.Ref<HTMLElement>,
  ): JSX.Element => {
    // @TODO: empty state
    if (!title) {
      return <></>
    }

    let PreviewMedia

    if (media?.url) {
      const baseUrl = new URL(media.url)
      baseUrl.searchParams.set('h', '66')
      baseUrl.searchParams.set('w', '66')
      baseUrl.searchParams.set('fit', 'crop')
      const mediaUrl = baseUrl.toString()
      // media url string params for sanity img
      PreviewMedia = <img src={mediaUrl} alt="" />
    } else {
      PreviewMedia = <DocumentIcon />
    }

    return (
      <>
        <style>{`
          .DocumentPreviewLayout {
            --_hoverFocusBg: light-dark(var(--shade-11), var(--tint-1));
            --_selectedBg: light-dark(var(--blue-10), var(--blue-2));
            --_selectedFg: light-dark(var(--gray-1), var(--gray-10));
            --_titleFg: light-dark(var(--gray-1), var(--gray-10));
            --_subtitleFg: light-dark(var(--gray-4), var(--gray-7));
            --_docTypeFg: light-dark(var(--gray-1), var(--gray-10));
            --_docTypeBg: light-dark(var(--shade-10), var(--tint-1));
            --_publishedFg: light-dark(var(--gray-1), var(--gray-10));
            --_publishedBg: light-dark(var(--green-10), var(--green-2));
            --_draftFg: light-dark(var(--gray-1), var(--gray-10));
            --_draftBg: light-dark(var(--yellow-6), var(--yellow-2));

            appearance: none;

            &:has(:hover, focus) {
              background-color: var(--hoverFocusBg, var(--_hoverFocusBg));
            }

            &.selected {
              background-color: var(--selectedBg, var(--_selectedBg));
              color: var(--selectedFg, var(--_selectedFg));
            }

            .Title {
              color: var(--titleFg, var(--_titleFg));
            }

            &:not(.selected) .Subtitle {
              color: var(--subtitleFg, var(--_subtitleFg));
            }

            .Media {
              aspect-ratio: 1;
              inline-size: 33px;
              border-color: var(--gray-8);
            }

            .DocType {
              color: var(--docTypeFg, var(--_docTypeFg));
              background-color: var(--docTypeBg, var(--_docTypeBg));
            }

            .Published {
              color: var(--publishedFg, var(--_publishedFg));
              background-color: var(--publishedBg, var(--_publishedBg));
            }

            .Draft {
              color: var(--draftFg, var(--_draftFg));
              background-color: var(--draftBg, var(--_draftBg));
            }

            :is(.Published, .Draft) figcaption {
              @container (width < 52ch) {
                clip: rect(0 0 0 0);
                clip-path: inset(50%);
                height: 1px;
                overflow: hidden;
                position: absolute;
                white-space: nowrap;
                width: 1px;
              }
            }

          }
        `}</style>
        <button
          onClick={onClick}
          ref={ref as React.Ref<HTMLButtonElement>}
          className={`DocumentPreviewLayout block si-100 text-start p-1 radius1 ${selected ? 'selected' : ''}`}
        >
          <div className="container-inline flex align-items-center gap-2 font-sans">
            <figure className="Media border0 border-solid flex-none flex align-items-center justify-content-center object-cover">
              {PreviewMedia}
            </figure>

            <div className="leading2 flex-grow overflow-hidden">
              <p className="Title text-1 font-medium truncate">{title}</p>
              {subtitle && <p className="Subtitle text-1 truncate">{subtitle}</p>}
            </div>

            {docType && (
              <figure className="DocType inline-block pb-5 pi-3 radius-pill text-2">
                <figcaption className="inline">{docType}</figcaption>
              </figure>
            )}

            {/* @TODO: finalize UI for this */}
            {status === 'published' && (
              <figure className="Published inline-block pb-5 pi-3 radius-pill text-2">
                ✔︎ <figcaption className="inline">published</figcaption>
              </figure>
            )}

            {/* @TODO: finalize UI for this */}
            {status === 'draft' && (
              <figure className="Draft inline-block pb-5 pi-3 radius-pill text-2">
                ⛑︎ <figcaption className="inline">draft</figcaption>
              </figure>
            )}
          </div>
        </button>
      </>
    )
  },
)

DocumentPreviewLayout.displayName = 'DocumentPreviewLayout'
