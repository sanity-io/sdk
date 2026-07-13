import {
  DocumentHandle,
  ResourceProvider,
  useDatasets,
  useDocumentPreview,
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
} from '@sanity/ui'
import {defineQuery} from 'groq'
import {JSX, startTransition, Suspense, useCallback, useRef, useState} from 'react'
import {ErrorBoundary} from 'react-error-boundary'

import {JsonDocumentEditor} from '../components/JsonDocumentEditor'
import {LoadMore} from '../components/LoadMore'
import {PaginatedListToolbar} from '../components/PaginatedListToolbar'
import {PaginationControls} from '../components/PaginationControls'
// Import the custom table components
import {Table, TD, TH, TR} from '../components/TableElements'
import {UserListItem} from '../components/UserListItem'

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

  return (
    <Dialog
      header={`Editing ${documentType}: ${documentId}`}
      id="document-editor-dialog"
      onClose={onClose}
      open={open}
      width={2}
    >
      <Stack space={4} padding={4}>
        <JsonDocumentEditor documentHandle={handle} wrapInCard={false} maxHeight="70vh" />
        <Flex justify="flex-end">
          <Button tone="primary" text="Close" onClick={onClose} />
        </Flex>
      </Stack>
    </Dialog>
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
      <TR ref={ref} data-testid={`org-document-row-${doc.documentId}`}>
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
            data-testid={`org-document-view-${doc.documentId}`}
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
        <PaginatedListToolbar
          noun="documents"
          idSuffix={documentType}
          searchTerm={searchTerm}
          onSearchChange={handleSearchChange}
          pageSize={pageSize}
          onPageSizeChange={handlePageSizeChange}
          count={count}
          startIndex={startIndex}
          endIndex={endIndex}
        />

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

        <Table style={{opacity: isPending ? 0.7 : 1}} data-testid="org-document-table">
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
                  fallbackRender={({error}) => (
                    <DocumentRowError error={error as unknown as Error} />
                  )}
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

  // Reset to the first available type when the dataset or that first type changes.
  const [prevConfig, setPrevConfig] = useState(config)
  const [prevFirstDocumentType, setPrevFirstDocumentType] = useState(firstDocumentType)
  if (prevConfig !== config || prevFirstDocumentType !== firstDocumentType) {
    setPrevConfig(config)
    setPrevFirstDocumentType(firstDocumentType)
    setSelectedType(firstDocumentType ?? null)
  }

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
          data-testid="org-doctype-select"
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
          data-testid="org-dataset-select"
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
                <UserListItem key={user.profile.id} user={user} />
              ))}

              <LoadMore as="div" isPending={isPending} hasMore={hasMore} onLoadMore={loadMore} />
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
          data-testid="org-project-select"
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
