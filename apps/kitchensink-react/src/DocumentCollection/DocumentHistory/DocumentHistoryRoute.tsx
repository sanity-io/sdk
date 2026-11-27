import {ClockIcon} from '@sanity/icons/Clock'
import {type JSX, Suspense} from 'react'
import {Spinner} from 'ui5'

import {ArticleWorkspace} from '../../components/ArticleEditor'
import {PageLayout} from '../../components/PageLayout'
import {DocumentHistoryPanel} from './DocumentHistoryPanel'

/** Kitchensink route pairing the shared article workspace with {@link DocumentHistoryPanel}. */
export function DocumentHistoryRoute(): JSX.Element {
  return (
    <PageLayout
      icon={ClockIcon}
      title="Document history"
      subtitle="Edit, publish, or discard an article and watch its history update live"
    >
      <Suspense fallback={<Spinner />}>
        <ArticleWorkspace
          autoSelectFirst
          showAllActions
          renderSidePanel={(handle) => (
            <DocumentHistoryPanel key={handle.documentId} handle={handle} />
          )}
        />
      </Suspense>
    </PageLayout>
  )
}
