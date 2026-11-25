import {DocumentIcon} from '@sanity/icons/Document'
import {type JSX} from 'react'

import {ArticleWorkspace} from '../components/ArticleEditor'
import {PageLayout} from '../components/PageLayout'

export function StudioDemoRoute(): JSX.Element {
  return (
    <PageLayout
      icon={DocumentIcon}
      title="Studio"
      subtitle="A minimal document list and form, like Sanity Studio"
    >
      <ArticleWorkspace />
    </PageLayout>
  )
}
