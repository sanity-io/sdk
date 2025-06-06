import {createDocumentHandle, useDocument, useEditDocument} from '@sanity/sdk-react'
import {TextInput} from '@sanity/ui'
import {JSX} from 'react'

const doc = createDocumentHandle({
  documentType: 'author',
  documentId: 'db06bc9e-4608-465a-9551-a10cef478037',
  projectId: 'ppsg7ml5',
  dataset: 'test',
})

const doc2 = createDocumentHandle({
  documentType: 'player',
  documentId: 'a1b3019b-a0e0-49d5-8212-9d85b9661202',
  projectId: 'd45jg133',
  dataset: 'production',
})

export function MultiResourceRoute(): JSX.Element {
  const {data: author} = useDocument(doc)
  const {data: player} = useDocument(doc2)
  const setAuthorName = useEditDocument({...doc, path: 'name'})
  const setPlayerName = useEditDocument({...doc2, path: 'name'})

  return (
    <div>
      <p style={{marginBottom: '2rem'}}>
        This route demonstrates how to use multiple resources in a single page.
        <br />
        Note you must have access to both resources (ppsg7ml5.test and d45jg133.production) to see
        the documents.
      </p>
      <div style={{display: 'flex', gap: '2rem', flexWrap: 'wrap'}}>
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
          <h2 style={{marginBottom: '1rem'}}>Author Document (ppsg7ml5.test)</h2>
          <a
            style={{display: 'block', marginBottom: '1rem', color: '#3e41e7'}}
            href={`https://test-studio.sanity.build/test/structure/author;${author?._id}`}
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
                {author.awards.map((award, index) => (
                  <li key={index}>{award}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

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
            Player Document (d45jg133.production)
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
      </div>
    </div>
  )
}
