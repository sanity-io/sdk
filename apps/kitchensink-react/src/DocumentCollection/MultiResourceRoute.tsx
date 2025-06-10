import {type DocumentHandle, useDocument, useDocuments, useEditDocument} from '@sanity/sdk-react'
import {Box, TextInput} from '@sanity/ui'
import {JSX} from 'react'

import {devConfigs, e2eConfigs} from '../sanityConfigs'

function AuthorEditor({docHandle}: {docHandle: DocumentHandle<'author'>}) {
  const {data: author} = useDocument(docHandle)
  const setAuthorName = useEditDocument({...docHandle, path: 'name'})

  return (
    <div
      style={{
        padding: '2rem',
        borderRadius: '8px',
        backgroundColor: '#3f0067',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        minWidth: '300px',
        flex: 1,
        color: '#fff',
      }}
    >
      <h2 style={{marginBottom: '1rem'}}>
        Author Document ({docHandle.projectId}.{docHandle.dataset})
      </h2>
      <a
        style={{display: 'block', marginBottom: '1rem', color: '#3e41e7'}}
        href={`https://test-studio.sanity.build/${docHandle.dataset}/structure/author;${author?._id}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        View in Studio →
      </a>
      <h3 style={{fontSize: '1.5rem', marginBottom: '0.5rem'}}>{author?.name}</h3>
      <TextInput
        label="Name"
        type="text"
        value={author?.name}
        onChange={(e) => setAuthorName(e.currentTarget.value)}
      />
      {author?.role && <p style={{color: '#fff', marginBottom: '1rem'}}>Role: {author.role}</p>}
      {author?.awards && author.awards.length > 0 && (
        <div>
          <h4 style={{marginBottom: '0.5rem'}}>Awards</h4>
          <ul style={{paddingLeft: '1.5rem'}}>
            {author.awards.map((award: string, index: number) => (
              <li key={index}>{award}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function PlayerEditor({docHandle}: {docHandle: DocumentHandle<'player'>}) {
  const {data: player} = useDocument(docHandle)
  const setPlayerName = useEditDocument({...docHandle, path: 'name'})

  return (
    <div
      style={{
        padding: '2rem',
        borderRadius: '8px',
        backgroundColor: '#b4e6ef',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        minWidth: '300px',
        flex: 1,
        color: '#444',
      }}
    >
      <h2 style={{marginBottom: '1rem', color: '#2a2a2a'}}>
        Player Document ({docHandle.projectId}.{docHandle.dataset})
      </h2>
      <a
        style={{display: 'block', marginBottom: '1rem', color: '#3e41e7'}}
        href={`https://autofoos.com/structure/player;${player?._id}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        View in Studio →
      </a>

      <h3 style={{fontSize: '1.5rem', marginBottom: '0.5rem'}}>{player?.name}</h3>
      <TextInput
        label="Name"
        type="text"
        value={player?.name}
        onChange={(e) => setPlayerName(e.currentTarget.value)}
      />
      <div style={{color: '#444', marginBottom: '1rem'}}>
        {player?.slackUserId && `Slack User ID: ${player.slackUserId}`}
      </div>
    </div>
  )
}

export function MultiResourceRoute(): JSX.Element {
  const configs = import.meta.env['VITE_IS_E2E'] ? e2eConfigs : devConfigs
  const {data: authorDocuments} = useDocuments({
    documentType: 'author',
    batchSize: 1,
    projectId: configs[0].projectId,
    dataset: configs[0].dataset,
  })

  const {data: playerDocuments} = useDocuments({
    documentType: 'player',
    batchSize: 1,
    projectId: configs[1].projectId,
    dataset: configs[1].dataset,
  })

  const authorHandle = authorDocuments[0] ?? null
  const playerHandle = playerDocuments[0] ?? null

  if (!authorDocuments.length || !playerDocuments.length) {
    return <Box padding={4}>No documents found in one or both datasets</Box>
  }

  if (!authorHandle || !playerHandle) {
    return <Box padding={4}>Loading...</Box>
  }

  return (
    <div>
      <p style={{marginBottom: '2rem'}}>
        This route demonstrates how to use multiple resources in a single page.
        <br />
        Note you must have access to both resources ({configs[0].projectId}.{configs[0].dataset} and{' '}
        {configs[1].projectId}.{configs[1].dataset}) to see the documents.
      </p>
      <div style={{display: 'flex', gap: '2rem', flexWrap: 'wrap'}}>
        <AuthorEditor docHandle={authorHandle} />
        <PlayerEditor docHandle={playerHandle} />
      </div>
    </div>
  )
}
