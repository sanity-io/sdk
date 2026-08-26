import {useAgentResourceContext, useDocuments, useSanityInstance} from '@sanity/sdk-react'
import {Badge, Box, Button, Card, Flex, Heading, Select, Stack, Text, TextInput} from '@sanity/ui'
import {type JSX, useEffect, useMemo, useRef, useState} from 'react'

/**
 * Route that demonstrates the useAgentResourceContext hook.
 * This allows testing how the agent receives context updates about
 * what resource the user is currently viewing/editing.
 */
export function AgentResourceContextRoute(): JSX.Element {
  // Get the current instance from context to access projectId and dataset
  const instance = useSanityInstance()
  const projectId = instance.config.projectId!
  const dataset = instance.config.dataset!

  // Fetch some documents to use as examples
  const {data: documents} = useDocuments({
    documentType: 'author',
    batchSize: 10,
  })

  const [selectedDocumentId, setSelectedDocumentId] = useState<string | undefined>(
    documents[0]?.documentId,
  )
  const [customDocumentId, setCustomDocumentId] = useState<string>('')
  const [includeDocumentId, setIncludeDocumentId] = useState<boolean>(true)
  const [lastUpdateTime, setLastUpdateTime] = useState<Date | null>(null)
  const [updateCount, setUpdateCount] = useState<number>(0)

  // This is the key hook - it automatically sends context updates to the Dashboard
  const contextOptions = useMemo(
    () => ({
      projectId,
      dataset,
      documentId: includeDocumentId ? selectedDocumentId : undefined,
    }),
    [projectId, dataset, includeDocumentId, selectedDocumentId],
  )

  // Track when context changes to show updates
  const prevContextRef = useRef<string>('')

  useEffect(() => {
    const contextKey = `${contextOptions.projectId}:${contextOptions.dataset}:${contextOptions.documentId || ''}`
    if (prevContextRef.current !== contextKey && prevContextRef.current !== '') {
      setLastUpdateTime(new Date())
      setUpdateCount((c) => c + 1)
      // eslint-disable-next-line no-console
      console.log('[AgentResourceContextRoute] Context updated:', contextOptions)
    }
    prevContextRef.current = contextKey
  }, [contextOptions])

  useAgentResourceContext(contextOptions)

  const handleDocumentSelect = (value: string) => {
    if (value === 'custom') {
      setSelectedDocumentId(customDocumentId)
    } else if (value === 'none') {
      setSelectedDocumentId(undefined)
    } else {
      setSelectedDocumentId(value)
    }
  }

  const handleCustomDocumentSubmit = () => {
    if (customDocumentId) {
      setSelectedDocumentId(customDocumentId)
    }
  }

  return (
    <Box padding={4}>
      <Stack space={5}>
        {/* Header */}
        <Card padding={4} radius={2} shadow={1}>
          <Stack space={3}>
            <Heading as="h1" size={3}>
              Agent Resource Context
            </Heading>
            <Text size={2} muted>
              This page demonstrates the <code>useAgentResourceContext</code> hook, which
              automatically notifies the Dashboard about what resource you&rsquo;re currently
              viewing or editing. This allows the Agent to understand your context and provide more
              relevant assistance.
            </Text>
          </Stack>
        </Card>

        {/* Current Context Display */}
        <Card padding={4} radius={2} shadow={1} tone="primary">
          <Stack space={3}>
            <Flex gap={2} align="center">
              <Text size={1} weight="semibold">
                Current Context Being Sent to Agent
              </Text>
              <Badge tone="positive" fontSize={1}>
                Live
              </Badge>
            </Flex>
            <Card padding={3} radius={2} tone="inherit" border>
              <Stack space={2}>
                <Flex gap={2}>
                  <Text size={1} weight="semibold" style={{minWidth: '100px'}}>
                    Project ID:
                  </Text>
                  <Text size={1} style={{fontFamily: 'monospace'}}>
                    {projectId}
                  </Text>
                </Flex>
                <Flex gap={2}>
                  <Text size={1} weight="semibold" style={{minWidth: '100px'}}>
                    Dataset:
                  </Text>
                  <Text size={1} style={{fontFamily: 'monospace'}}>
                    {dataset}
                  </Text>
                </Flex>
                <Flex gap={2}>
                  <Text size={1} weight="semibold" style={{minWidth: '100px'}}>
                    Document ID:
                  </Text>
                  <Text
                    size={1}
                    style={{fontFamily: 'monospace'}}
                    muted={!includeDocumentId || !selectedDocumentId}
                  >
                    {includeDocumentId && selectedDocumentId ? selectedDocumentId : '(not set)'}
                  </Text>
                </Flex>
              </Stack>
            </Card>

            {/* Update stats */}
            <Card padding={3} radius={2} tone="caution" border>
              <Stack space={2}>
                <Text size={1} weight="semibold">
                  📊 Update Statistics
                </Text>
                <Flex gap={2}>
                  <Text size={1} style={{minWidth: '120px'}}>
                    Updates sent:
                  </Text>
                  <Text size={1} weight="bold">
                    {updateCount}
                  </Text>
                </Flex>
                {lastUpdateTime && (
                  <Flex gap={2}>
                    <Text size={1} style={{minWidth: '120px'}}>
                      Last update:
                    </Text>
                    <Text size={1} style={{fontFamily: 'monospace'}}>
                      {lastUpdateTime.toLocaleTimeString()}
                    </Text>
                  </Flex>
                )}
                {updateCount === 0 && (
                  <Text size={1} muted>
                    Change a value below to send an update
                  </Text>
                )}
              </Stack>
            </Card>
          </Stack>
        </Card>

        {/* Document Selection Controls */}
        <Card padding={4} radius={2} shadow={1}>
          <Stack space={4}>
            <Text size={2} weight="semibold">
              Select a Document to View
            </Text>
            <Text size={1} muted>
              Change the document selection below to see the context update in real-time. The
              Dashboard and Agent will be notified automatically.
            </Text>

            {/* Toggle Document Context */}
            <Flex gap={3} align="center">
              <Button
                text={includeDocumentId ? 'Disable Document Context' : 'Enable Document Context'}
                tone={includeDocumentId ? 'default' : 'primary'}
                onClick={() => setIncludeDocumentId(!includeDocumentId)}
                fontSize={1}
              />
              <Text size={1} muted>
                {includeDocumentId
                  ? 'Document ID is being sent'
                  : 'Only project/dataset is being sent'}
              </Text>
            </Flex>

            {includeDocumentId && (
              <Stack space={3}>
                {/* Document Dropdown */}
                {documents.length > 0 && (
                  <Box>
                    <Select
                      fontSize={2}
                      value={selectedDocumentId || 'none'}
                      onChange={(e) => handleDocumentSelect(e.currentTarget.value)}
                    >
                      <option value="none">-- No Document Selected --</option>
                      {documents.map((doc) => (
                        <option key={doc.documentId} value={doc.documentId}>
                          {doc.documentId}
                        </option>
                      ))}
                      <option value="custom">-- Custom Document ID --</option>
                    </Select>
                  </Box>
                )}

                {/* Custom Document ID Input */}
                <Card padding={3} tone="transparent" border>
                  <Stack space={3}>
                    <Text size={1} weight="semibold">
                      Or Enter Custom Document ID
                    </Text>
                    <Flex gap={2}>
                      <Box flex={1}>
                        <TextInput
                          fontSize={1}
                          placeholder="e.g., drafts.my-custom-id"
                          value={customDocumentId}
                          onChange={(e) => setCustomDocumentId(e.currentTarget.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleCustomDocumentSubmit()
                            }
                          }}
                        />
                      </Box>
                      <Button
                        text="Apply"
                        tone="primary"
                        onClick={handleCustomDocumentSubmit}
                        disabled={!customDocumentId}
                        fontSize={1}
                      />
                    </Flex>
                  </Stack>
                </Card>
              </Stack>
            )}
          </Stack>
        </Card>

        {/* Information Card */}
        <Card padding={4} radius={2} tone="transparent" border>
          <Stack space={3}>
            <Text size={1} weight="semibold">
              💡 How This Works
            </Text>
            <Stack space={2}>
              <Text size={1}>
                • The <code>useAgentResourceContext</code> hook runs automatically on every render
              </Text>
              <Text size={1}>
                • When the projectId, dataset, or documentId changes, it sends an update message
              </Text>
              <Text size={1}>
                • The Dashboard receives these updates and can route them to the Agent
              </Text>
              <Text size={1}>
                • The Agent uses this context to understand what you&rsquo;re working on
              </Text>
              <Text size={1}>• This enables context-aware assistance without manual prompting</Text>
            </Stack>
          </Stack>
        </Card>

        {/* Message Details */}
        <Card padding={4} radius={2} tone="transparent" border>
          <Stack space={3}>
            <Text size={1} weight="semibold">
              📨 Message Being Sent
            </Text>
            <Text size={1} muted>
              The hook sends messages with the following structure:
            </Text>
            <Card padding={3} radius={2} tone="default" border>
              <Stack space={2}>
                <Text size={1} style={{fontFamily: 'monospace'}}>
                  <strong>Type:</strong> &lsquo;dashboard/v1/events/agent/resource/update&rsquo;
                </Text>
                <Text size={1} style={{fontFamily: 'monospace'}}>
                  <strong>Data:</strong> {'{'}
                </Text>
                <Box paddingLeft={3}>
                  <Stack space={1}>
                    <Text size={1} style={{fontFamily: 'monospace'}}>
                      projectId: &lsquo;{projectId}&rsquo;,
                    </Text>
                    <Text size={1} style={{fontFamily: 'monospace'}}>
                      dataset: &lsquo;{dataset}&rsquo;,
                    </Text>
                    <Text size={1} style={{fontFamily: 'monospace'}}>
                      documentId:{' '}
                      {includeDocumentId && selectedDocumentId
                        ? `'${selectedDocumentId}'`
                        : 'undefined'}
                    </Text>
                  </Stack>
                </Box>
                <Text size={1} style={{fontFamily: 'monospace'}}>
                  {'}'}
                </Text>
              </Stack>
            </Card>
          </Stack>
        </Card>

        {/* Developer Info */}
        <Card padding={3} radius={2} tone="caution">
          <Stack space={3}>
            <Text size={1} weight="semibold">
              🔧 For Developers
            </Text>
            <Stack space={2}>
              <Text size={1}>
                <strong>To see messages in the browser:</strong>
              </Text>
              <Box paddingLeft={3}>
                <Stack space={1}>
                  <Text size={1}>
                    1. Open DevTools Console - check for console.log messages from this component
                  </Text>
                  <Text size={1}>2. The hook logs warnings if projectId/dataset are missing</Text>
                  <Text size={1}>3. The hook logs errors if message sending fails</Text>
                  <Text size={1}>
                    4. Messages are sent via the Comlink WindowConnection to the parent dashboard
                  </Text>
                </Stack>
              </Box>
              <Text size={1} muted>
                Note: If you&rsquo;re testing this standalone (not embedded in a dashboard), the
                messages may be sent but there won&rsquo;t be a receiver to process them.
              </Text>
            </Stack>
          </Stack>
        </Card>
      </Stack>
    </Box>
  )
}
