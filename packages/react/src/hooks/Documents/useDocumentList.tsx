import {type DocumentOptions, getDocuments, type SanityInstance} from '@sanity/sdk'
import {useEffect, useState} from 'react'

/** @public */
export const useDocumentList = (
  options: DocumentOptions,
  sanityInstance: SanityInstance,
): {
  documents: {id: string; title: string; subtitle: string; media: string}[]
  isLoading: boolean
} => {
  const [documents, setDocuments] = useState<
    {id: string; title: string; subtitle: string; media: string}[]
  >([])
  const [isLoading, setIsLoading] = useState(true)
  useEffect(() => {
    const getDocumentsPromise = getDocuments(options, sanityInstance)
    getDocumentsPromise.then(({documents: _documents, isLoading: _isLoading}) => {
      setDocuments(_documents)
      setIsLoading(_isLoading)
    })
  }, [])
  return {
    documents,
    isLoading,
  }
}
