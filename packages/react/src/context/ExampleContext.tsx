import {createClient, type SanityClient} from '@sanity/client'
import {Schema} from '@sanity/schema'
import {type Schema as SchemaInterface} from '@sanity/types'
import React, {createContext, type ReactNode, useMemo} from 'react'
import {createDocumentPreviewStore, type DocumentPreviewStore} from 'sanity' // this should NOT be installed from the sanity package -- we should make our own affordances in SDK

interface SDKConfig {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schemaTypes: any[]
  projectId: string
  dataset: string
  apiVersion: string
  // THIS ISN'T REAL, JUST A PLACEHOLDER UNTIL WE GET AUTH
  token: string
  useCdn?: boolean
}

interface SDKContextValue {
  documentPreviewStore: DocumentPreviewStore
  schema: SchemaInterface
  client: SanityClient
}

interface SDKProviderProps {
  config: SDKConfig
  children: React.ReactNode
}

export const SDKContext = createContext<SDKContextValue | undefined>(undefined)

/** @public */
export function SDKPreviewProvider({config, children}: SDKProviderProps): ReactNode {
  const {projectId, dataset, apiVersion, token, schemaTypes} = config

  const client = useMemo(
    () =>
      createClient({
        projectId: projectId,
        dataset: dataset,
        useCdn: false,
        apiVersion: apiVersion,
        token: token,
      }),
    [projectId, dataset, apiVersion, token],
  )

  const schema = useMemo(() => Schema.compile({name: 'example', types: schemaTypes}), [schemaTypes])

  // Create document preview store
  const documentPreviewStore = useMemo(() => createDocumentPreviewStore({client}), [client])

  // Create combined context value
  const contextValue = useMemo(
    () => ({
      documentPreviewStore,
      schema,
      client,
    }),
    [config, documentPreviewStore],
  )

  return <SDKContext.Provider value={contextValue}>{children}</SDKContext.Provider>
}
