import {
  DocumentHandle,
  ResourceProvider,
  useDatasets,
  useDocument,
  useDocumentPreview,
  useDocumentSyncStatus,
  useEditDocument,
  usePaginatedDocuments,
  useProject,
  useProjects,
  useQuery,
  useSanityInstance,
  useUsers,
} from '@sanity/sdk-react'
import {
  Avatar,
  Box,
  Button,
  Card,
  Container,
  Dialog,
  Flex,
  Heading,
  Label,
  Select,
  Spinner,
  Stack,
  Text,
  TextInput,
} from '@sanity/ui'
import {defineQuery} from 'groq'
import {type JsonData, JsonEditor} from 'json-edit-react'
import {JSX, startTransition, Suspense, useCallback, useEffect, useRef, useState} from 'react'
import {ErrorBoundary} from 'react-error-boundary'

// Import the custom table components
import {Table, TD, TH, TR} from '../components/TableElements'

interface DocumentEditorDialogProps {
  documentId: string
  documentType: string
  onClose: () => void
  open: boolean
}

function DocumentEditorDialog({
  documentId,
  documentType,
  onClose,
  open,
}: DocumentEditorDialogProps) {
  const handle = {documentId, documentType}
  const document = useDocument(handle)
  const editDocument = useEditDocument(handle)
  const isSaving = useDocumentSyncStatus(handle)

  const editorStyles = {
    container: {
      height: '100%',
      border: '1px solid #e2e2e2',
      borderRadius: '4px',
      padding: '8px',
      backgroundColor: '#fafafa',
    },
  }

  return (
    <>
      <Dialog
        header={`Editing ${documentType}: ${documentId}`}
        id="document-editor-dialog"
        onClose={onClose}
        open={open}
        width={2}
      >
        <ErrorBoundary
          fallback={
            <Box padding={4}>
              <Card tone="critical" padding={4}>
                <Text>Error loading document editor. Please try again.</Text>
              </Card>
            </Box>
          }
        >
          <Stack space={4} padding={4}>
            <Box style={{height: '70vh', overflow: 'auto'}}>
              {document && (
                <div style={editorStyles.container}>
                  <JsonEditor data={document} setData={editDocument as (data: JsonData) => void} />
                </div>
              )}
            </Box>
            <Flex justify="flex-end" gap={2}>
              <Button mode="ghost" text="Cancel" onClick={onClose} disabled={isSaving} />
              <Button
                tone="primary"
                text={isSaving ? 'Syncing...' : 'Close'}
                onClick={onClose}
                disabled={isSaving}
                loading={isSaving}
              />
            </Flex>
          </Stack>
        </ErrorBoundary>
      </Dialog>
    </>
  )
}

// Component for displaying document data with proper error handling
function DocumentTableRow(doc: DocumentHandle) {
  const ref = useRef<HTMLTableRowElement>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const {data} = useDocumentPreview(doc)

  const handleOpenDialog = () => setIsDialogOpen(true)
  const handleCloseDialog = () => setIsDialogOpen(false)

  return (
    <>
      <TR ref={ref}>
        <TD padding={3}>{data.title}</TD>
        <TD padding={3}>{data.subtitle || '-'}</TD>
        <TD padding={3}>{doc.documentType}</TD>
        <TD padding={3}>
          <Button
            fontSize={1}
            padding={2}
            text="View"
            tone="primary"
            mode="ghost"
            onClick={handleOpenDialog}
          />
        </TD>
      </TR>

      {isDialogOpen && (
        <DocumentEditorDialog {...doc} onClose={handleCloseDialog} open={isDialogOpen} />
      )}
    </>
  )
}

// Loading fallback for document row
function DocumentRowFallback() {
  return (
    <TR>
      <TD padding={3}>
        <Flex align="center" justify="center" padding={3}>
          <Spinner />
          <Text size={1} style={{marginLeft: '8px'}}>
            Loading document...
          </Text>
        </Flex>
      </TD>
      <TD padding={0} />
      <TD padding={0} />
      <TD padding={0} />
    </TR>
  )
}

// Error fallback for document row
function DocumentRowError({error}: {error: Error}) {
  return (
    <TR>
      <TD padding={3}>
        <Card tone="critical" padding={3}>
          <Stack space={2}>
            <Text weight="semibold">Error loading document</Text>
            <Text size={1}>{error.message}</Text>
            {error.stack && (
              <Box style={{maxHeight: '100px', overflow: 'auto', fontSize: '12px'}}>
                <pre style={{margin: 0}}>{error.stack}</pre>
              </Box>
            )}
          </Stack>
        </Card>
      </TD>
    </TR>
  )
}

// Pagination controls component
interface PaginationControlsProps {
  currentPage: number
  totalPages: number
  hasFirstPage: boolean
  hasPreviousPage: boolean
  hasNextPage: boolean
  hasLastPage: boolean
  firstPage: () => void
  previousPage: () => void
  nextPage: () => void
  lastPage: () => void
  goToPage: (pageNumber: number) => void
  isPending: boolean
}

function PaginationControls({
  currentPage,
  totalPages,
  hasFirstPage,
  hasPreviousPage,
  hasNextPage,
  hasLastPage,
  firstPage,
  previousPage,
  nextPage,
  lastPage,
  goToPage,
  isPending,
}: PaginationControlsProps) {
  const buttonStyle = {
    minWidth: '40px',
    margin: '0 4px',
    textAlign: 'center',
  } as const

  // Generate page number buttons
  const pageButtons = () => {
    const buttons = []
    const maxVisiblePages = 5
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2))
    const endPage = Math.min(totalPages, startPage + maxVisiblePages - 1)

    if (endPage - startPage + 1 < maxVisiblePages) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1)
    }

    for (let i = startPage; i <= endPage; i++) {
      buttons.push(
        <Button
          key={i}
          mode={i === currentPage ? 'default' : 'ghost'}
          onClick={() => goToPage(i)}
          style={{
            ...buttonStyle,
            fontWeight: i === currentPage ? 'bold' : 'normal',
          }}
        >
          {i}
        </Button>,
      )
    }
    return buttons
  }

  return (
    <Flex align="center" justify="space-between" padding={3}>
      <Flex>
        <Button
          onClick={firstPage}
          disabled={!hasFirstPage}
          style={buttonStyle}
          text="<<"
          mode="ghost"
        />
        <Button
          onClick={previousPage}
          disabled={!hasPreviousPage}
          style={buttonStyle}
          text="<"
          mode="ghost"
        />
        {pageButtons()}
        <Button
          onClick={nextPage}
          disabled={!hasNextPage}
          style={buttonStyle}
          text=">"
          mode="ghost"
        />
        <Button
          onClick={lastPage}
          disabled={!hasLastPage}
          style={buttonStyle}
          text=">>"
          mode="ghost"
        />
      </Flex>
      <Text size={1} style={{opacity: isPending ? 0.5 : 1}}>
        Page {currentPage} of {totalPages}
      </Text>
    </Flex>
  )
}

// Component to display documents of a specific type within a dataset
interface DocumentListProps {
  documentType: string
}

function DocumentList({documentType}: DocumentListProps) {
  const {config} = useSanityInstance()
  const [searchTerm, setSearchTerm] = useState('')
  const [pageSize, setPageSize] = useState(10)

  const {
    data,
    isPending,
    currentPage,
    totalPages,
    hasFirstPage,
    hasPreviousPage,
    hasNextPage,
    hasLastPage,
    firstPage,
    previousPage,
    nextPage,
    lastPage,
    goToPage,
    count,
    startIndex,
    endIndex,
  } = usePaginatedDocuments({
    filter: `_type == "${documentType}"`,
    orderings: [{field: '_updatedAt', direction: 'desc'}],
    search: searchTerm,
    pageSize,
  })

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.currentTarget.value)
  }

  const handlePageSizeChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setPageSize(Number(event.currentTarget.value))
  }

  if (data.length === 0 && !isPending) {
    return (
      <Card padding={4} tone="caution">
        <Text>
          No documents found of type &quot;{documentType}&quot; in dataset &quot;{config.dataset}
          &quot;
        </Text>
      </Card>
    )
  }

  return (
    <Box padding={4}>
      <Heading as="h3" size={2}>
        {documentType} Documents
      </Heading>

      <Stack space={4} marginTop={4}>
        <Flex justify="space-between" align="center">
          <Box style={{width: '300px'}}>
            <Label
              htmlFor={`search-${documentType}`}
              size={1}
              style={{marginBottom: '4px', display: 'block'}}
            >
              Search Documents
            </Label>
            <TextInput
              id={`search--${documentType}`}
              value={searchTerm}
              onChange={handleSearchChange}
              placeholder="Search documents..."
              style={{width: '100%'}}
            />
          </Box>
          <Box>
            <Label
              htmlFor={`pageSize-${documentType}`}
              size={1}
              style={{marginBottom: '4px', display: 'block'}}
            >
              Items per page
            </Label>
            <select
              id={`pageSize-${documentType}`}
              value={pageSize}
              onChange={handlePageSizeChange}
              style={{
                padding: '8px',
                borderRadius: '4px',
                border: '1px solid #ccc',
              }}
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
          </Box>
        </Flex>

        <Box style={{borderRadius: '4px', border: '1px solid #eee', padding: '8px'}}>
          <Text size={1}>
            Showing {startIndex + 1}-{Math.min(endIndex, count)} of {count} documents
          </Text>
        </Box>

        <PaginationControls
          currentPage={currentPage}
          totalPages={totalPages}
          hasFirstPage={hasFirstPage}
          hasPreviousPage={hasPreviousPage}
          hasNextPage={hasNextPage}
          hasLastPage={hasLastPage}
          firstPage={firstPage}
          previousPage={previousPage}
          nextPage={nextPage}
          lastPage={lastPage}
          goToPage={goToPage}
          isPending={isPending}
        />

        <Table style={{opacity: isPending ? 0.7 : 1}}>
          <thead>
            <TR>
              <TH padding={3}>Title</TH>
              <TH padding={3}>Description</TH>
              <TH padding={3}>Type</TH>
              <TH padding={3}>Actions</TH>
            </TR>
          </thead>
          <tbody>
            {data.length > 0 ? (
              data.map((doc) => (
                <ErrorBoundary
                  key={doc.documentId}
                  fallbackRender={({error}) => <DocumentRowError error={error} />}
                >
                  <Suspense fallback={<DocumentRowFallback />}>
                    <DocumentTableRow {...doc} />
                  </Suspense>
                </ErrorBoundary>
              ))
            ) : (
              <TR>
                <TD padding={3}>
                  <Flex justify="center" align="center" padding={4}>
                    {isPending ? (
                      <>
                        <Spinner />
                        <Text size={2} style={{marginLeft: '8px'}}>
                          Loading documents...
                        </Text>
                      </>
                    ) : (
                      <Text>No documents found</Text>
                    )}
                  </Flex>
                </TD>
                <TD padding={0} />
                <TD padding={0} />
                <TD padding={0} />
                <TD padding={0} />
              </TR>
            )}
          </tbody>
        </Table>

        <PaginationControls
          currentPage={currentPage}
          totalPages={totalPages}
          hasFirstPage={hasFirstPage}
          hasPreviousPage={hasPreviousPage}
          hasNextPage={hasNextPage}
          hasLastPage={hasLastPage}
          firstPage={firstPage}
          previousPage={previousPage}
          nextPage={nextPage}
          lastPage={lastPage}
          goToPage={goToPage}
          isPending={isPending}
        />
      </Stack>
    </Box>
  )
}

const allTypes = defineQuery(`array::unique(*[]._type)`)

function DocumentTypes() {
  const {config} = useSanityInstance()
  if (!config.dataset) throw new Error('Dataset required for this component')

  // Use GROQ with array::unique to get all document types in the dataset
  const {data: documentTypes} = useQuery({query: allTypes})
  const firstDocumentType = documentTypes.at(0)
  const [selectedType, setSelectedType] = useState<string | null>(firstDocumentType ?? null)

  useEffect(() => {
    setSelectedType(firstDocumentType ?? null)
  }, [config, firstDocumentType])

  const handleTypeChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    startTransition(() => {
      setSelectedType(event.currentTarget.value)
    })
  }, [])

  if (!documentTypes || documentTypes.length === 0) {
    return (
      <Card padding={4} tone="caution">
        <Text>No document types found in dataset &quot;{config.dataset}&quot;</Text>
      </Card>
    )
  }

  return (
    <Stack space={4} padding={4}>
      <Box>
        <Label htmlFor={`doctype-${config.dataset}`} size={2}>
          Document Type
        </Label>
        <Select
          id={`doctype-${config.dataset}`}
          value={selectedType || ''}
          onChange={handleTypeChange}
          style={{width: '100%', marginTop: '8px'}}
        >
          <option value="">Select a document type</option>
          {documentTypes.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </Select>
      </Box>

      {selectedType && (
        <ErrorBoundary
          resetKeys={[config.dataset, selectedType]}
          fallback={
            <Card padding={4} tone="critical">
              <Text>Error loading documents of type &quot;{selectedType}&quot;</Text>
            </Card>
          }
        >
          <DocumentList documentType={selectedType} />
        </ErrorBoundary>
      )}
    </Stack>
  )
}

function DatasetExplorer() {
  const {config} = useSanityInstance()
  const datasets = useDatasets()
  const [selectedDataset, setSelectedDataset] = useState<string | null>(null)

  const handleDatasetChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedDataset(event.currentTarget.value)
  }, [])

  if (datasets.length === 0) {
    return (
      <Card padding={4} tone="caution">
        <Text>No datasets found in this project</Text>
      </Card>
    )
  }

  return (
    <Stack space={4} padding={4}>
      <Box>
        <Label htmlFor={`dataset-${config.projectId}`} size={2}>
          Dataset
        </Label>
        <Select
          id={`dataset-${config.projectId}`}
          value={selectedDataset || ''}
          onChange={handleDatasetChange}
          style={{width: '100%', marginTop: '8px'}}
        >
          <option value="">Select a dataset</option>
          {datasets.map((dataset) => (
            <option key={dataset.name} value={dataset.name}>
              {dataset.name}
            </option>
          ))}
        </Select>
      </Box>

      {selectedDataset && (
        <Card shadow={1} radius={2}>
          <ErrorBoundary
            resetKeys={[selectedDataset]}
            fallback={
              <Card padding={4} tone="critical">
                <Text>Error loading document types from dataset &quot;{selectedDataset}&quot;</Text>
              </Card>
            }
          >
            <ResourceProvider
              dataset={selectedDataset}
              fallback={
                <Flex align="center" padding={4}>
                  <Spinner />
                  <Text style={{marginLeft: '8px'}}>Loading document types...</Text>
                </Flex>
              }
            >
              <DocumentTypes />
            </ResourceProvider>
          </ErrorBoundary>
        </Card>
      )}
    </Stack>
  )
}

// Users Dialog component to display organization users
interface UsersDialogProps {
  open: boolean
  onClose: () => void
}

function UsersDialogContent() {
  const {data, hasMore, isPending, loadMore} = useUsers({batchSize: 10})

  return (
    <Stack space={3}>
      {isPending && data.length === 0 ? (
        <Flex align="center" justify="center" padding={4}>
          <Spinner />
          <Text style={{marginLeft: '8px'}}>Loading users...</Text>
        </Flex>
      ) : (
        <>
          {data.length === 0 ? (
            <Text>No users found</Text>
          ) : (
            <Stack space={2}>
              {data.map((user) => (
                <Card key={user.profile.id} padding={3} radius={2}>
                  <Flex align="center" gap={2}>
                    <Avatar size={1} src={user.profile.imageUrl} />
                    <Box>
                      <Text weight="semibold">{user.profile.displayName}</Text>
                      <Text size={1} muted>
                        {user.profile.email}
                      </Text>
                    </Box>
                  </Flex>
                </Card>
              ))}

              {hasMore && (
                <Button
                  onClick={loadMore}
                  text={isPending ? 'Loading...' : 'Load more'}
                  tone="primary"
                  mode="ghost"
                  disabled={isPending}
                  loading={isPending}
                />
              )}
            </Stack>
          )}
        </>
      )}
    </Stack>
  )
}

function UsersDialog({open, onClose}: UsersDialogProps) {
  return (
    <Dialog
      header="Project Users"
      id="project-users-dialog"
      onClose={onClose}
      open={open}
      width={1}
    >
      <Box padding={4} style={{maxHeight: '70vh', overflow: 'auto'}}>
        <Suspense fallback={<Spinner />}>
          <UsersDialogContent />
        </Suspense>
      </Box>
    </Dialog>
  )
}

function ProjectExplorer() {
  const project = useProject()
  const [isUsersDialogOpen, setIsUsersDialogOpen] = useState(false)

  const handleOpenUsersDialog = () => setIsUsersDialogOpen(true)
  const handleCloseUsersDialog = () => setIsUsersDialogOpen(false)

  return (
    <Stack space={4}>
      <Box padding={3}>
        <Flex justify="space-between" align="center">
          <Box>
            <Heading as="h3" size={2}>
              {project.displayName || project.id}
            </Heading>
            <Text size={1} muted>
              Project ID: {project.id}
            </Text>
            <Text size={1} muted>
              Members: {project.members.length}
            </Text>
          </Box>
          <Button
            text="View Users"
            tone="primary"
            mode="ghost"
            onClick={handleOpenUsersDialog}
            icon={Avatar}
          />
        </Flex>
      </Box>

      {isUsersDialogOpen && (
        <UsersDialog open={isUsersDialogOpen} onClose={handleCloseUsersDialog} />
      )}

      <Card shadow={1} radius={2}>
        <ErrorBoundary
          fallback={
            <Card padding={4} tone="critical">
              <Text>Error loading datasets for project &quot;{project.id}&quot;</Text>
            </Card>
          }
        >
          <DatasetExplorer />
        </ErrorBoundary>
      </Card>
    </Stack>
  )
}

// Component to display all projects
function ProjectsExplorer() {
  const projects = useProjects()
  const [selectedProject, setSelectedProject] = useState<string | null>(null)

  const handleProjectChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedProject(event.currentTarget.value)
  }, [])

  if (projects.length === 0) {
    return (
      <Card padding={4} tone="caution">
        <Text>No projects found</Text>
      </Card>
    )
  }

  return (
    <Stack space={4}>
      <Box>
        <Label htmlFor="project-selector" size={2}>
          Project
        </Label>
        <Select
          id="project-selector"
          value={selectedProject || ''}
          onChange={handleProjectChange}
          style={{width: '100%', marginTop: '8px'}}
        >
          <option value="">Select a project</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.displayName} - {project.id}
            </option>
          ))}
        </Select>
      </Box>

      {selectedProject && (
        <Card shadow={1} radius={2}>
          <ErrorBoundary
            resetKeys={[selectedProject]}
            fallback={
              <Card padding={4} tone="critical">
                <Text>Error loading project &quot;{selectedProject}&quot;</Text>
              </Card>
            }
          >
            <ResourceProvider
              projectId={selectedProject}
              fallback={
                <Flex align="center" padding={4}>
                  <Spinner />
                  <Text style={{marginLeft: '8px'}}>Loading project...</Text>
                </Flex>
              }
            >
              <ProjectExplorer />
            </ResourceProvider>
          </ErrorBoundary>
        </Card>
      )}
    </Stack>
  )
}

// Main route component
export function OrgDocumentExplorerRoute(): JSX.Element {
  return (
    <Container width={3}>
      <Stack space={5}>
        <Box padding={4}>
          <Heading as="h1" size={5}>
            Organization Document Explorer
          </Heading>
          <Text muted size={1}>
            Browse documents across your organization in a hierarchical structure
          </Text>
        </Box>

        <Card shadow={1} radius={2}>
          <Stack space={3}>
            <Box padding={3} style={{borderBottom: '1px solid #eee'}}>
              <Heading as="h2" size={2}>
                Projects Explorer
              </Heading>
              <Text size={1} muted>
                Navigate through projects → datasets → document types → documents
              </Text>
            </Box>
            <Box padding={3}>
              <ErrorBoundary
                fallback={
                  <Card padding={4} tone="critical">
                    <Text>Error loading projects</Text>
                  </Card>
                }
              >
                <ResourceProvider
                  projectId={undefined}
                  dataset={undefined}
                  fallback={
                    <Flex align="center" padding={4}>
                      <Spinner />
                      <Text style={{marginLeft: '8px'}}>Loading projects...</Text>
                    </Flex>
                  }
                >
                  <ProjectsExplorer />
                </ResourceProvider>
              </ErrorBoundary>
            </Box>
          </Stack>
        </Card>
      </Stack>
    </Container>
  )
}
