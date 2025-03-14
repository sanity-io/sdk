import {DocumentHandle, SanityDocument} from '@sanity/sdk'
import {useDocument, useEditDocument} from '@sanity/sdk-react'
import {TextInput} from '@sanity/ui'
import {JSX} from 'react'

export function MultiResourceRoute(): JSX.Element {
  interface Author extends SanityDocument {
    _type: 'author'
    name?: string
    role?: string
    awards?: string[]
    image?: {
      asset: {
        _ref: string
        _type: string
      }
    }
  }

  interface Dog extends SanityDocument {
    _type: 'dog'
    name?: string
    age?: string
    color?: string
    ears?: string
    status?: string
    weight?: string
    description?: string
    images?: {
      asset: {
        _ref: string
        _type: string
      }
    }[]
  }
  const doc: DocumentHandle<Author> = {
    _type: 'author',
    _id: 'db06bc9e-4608-465a-9551-a10cef478037',
    resourceId: 'document:ppsg7ml5.test:db06bc9e-4608-465a-9551-a10cef478037',
  }

  const doc2: DocumentHandle<Dog> = {
    _type: 'dog',
    _id: 'acc11e96-1a01-4907-bd0e-e8347217cf2f',
    resourceId: 'document:ezwd8xes.production:acc11e96-1a01-4907-bd0e-e8347217cf2f',
  }

  const setAuthorName = useEditDocument(doc, 'name')
  const setDogName = useEditDocument(doc2, 'name')

  const author = useDocument(doc)
  const dog = useDocument(doc2)

  return (
    <div>
      <p style={{marginBottom: '2rem'}}>
        This route demonstrates how to use multiple resources in a single page.
        <br />
        Note you must have access to both resources (ppsg7ml5.test and ezwd8xes.production) to see
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
            Dog Document (ezwd8xes.production)
          </h2>
          <a
            style={{display: 'block', marginBottom: '1rem', color: '#3e41e7'}}
            href={`https://bella.sanity.studio/structure/dog;${dog?._id}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            View in Studio →
          </a>

          <h3 style={{fontSize: '1.5rem', marginBottom: '0.5rem'}}>{dog?.name}</h3>
          <TextInput
            label="Name"
            type="text"
            value={dog?.name}
            onChange={(e) => setDogName(e.currentTarget.value)}
          />
          <div style={{color: '#444', marginBottom: '1rem'}}>
            {dog?.age && <p>Age: {dog.age}</p>}
            {dog?.color && <p>Color: {dog.color}</p>}
            {dog?.weight && <p>Weight: {dog.weight}</p>}
            {dog?.ears && <p>Ears: {dog.ears}</p>}
            {dog?.status && <p>Status: {dog.status}</p>}
          </div>
          {dog?.description && (
            <div>
              <h4 style={{marginBottom: '0.5rem'}}>About</h4>
              <p style={{color: '#444'}}>{dog.description}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
