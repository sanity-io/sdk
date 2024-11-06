import {useState, useEffect} from 'react'
import {createClient} from '@sanity/client'
import {StandalonePreview} from 'sdk-react/components/previews/StandalonePreview/StandalonePreview'
import {config} from '../config/config'

const client = createClient({
  projectId: config.projectId,
  dataset: config.dataset,
  apiVersion: config.apiVersion,
  useCdn: false,
  token: config.token,
})

const DOCUMENT_TYPES = [
  {value: 'book', label: 'Books'},
  {value: 'author', label: 'Authors'},
]

interface Document {
  _id: string
  _type: string
}

export const PreviewPage = () => {
  const [selectedType, setSelectedType] = useState('book')
  const [documents, setDocuments] = useState<Document[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchDocuments = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const query = `*[_type == $type] {
          _id,
          _type,
        }`

        const result = await client.fetch(query, {type: selectedType})
        setDocuments(result)
      } catch (err: unknown) {
        if (err instanceof Error) {
          setError(err.message)
        }
      } finally {
        setIsLoading(false)
      }
    }

    fetchDocuments()
  }, [selectedType])

  const handleTypeChange = (event: any) => {
    setSelectedType(event.target.value)
  }

  return (
    <div className="preview-page">
      <div className="header">
        <h1 className="page-title">Document Previews</h1>
        <select value={selectedType} onChange={handleTypeChange} className="type-selector">
          {DOCUMENT_TYPES.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <div className="loading-message">Loading {selectedType}s...</div>
      ) : error ? (
        <div className="error-message">Error: {error}</div>
      ) : documents.length === 0 ? (
        <div className="empty-message">No {selectedType}s found</div>
      ) : (
        <div className="preview-grid">
          {documents.map((doc) => (
            <div key={doc._id} className="preview-card">
              <StandalonePreview documentId={doc._id} documentType={doc._type} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default PreviewPage
