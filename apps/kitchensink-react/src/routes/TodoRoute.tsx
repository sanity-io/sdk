import {
  createDocument,
  createDocumentHandle,
  deleteDocument,
  type DocumentHandle,
  editDocument,
  publishDocument,
  useApplyDocumentActions,
  useDocumentProjection,
  useDocuments,
} from '@sanity/sdk-react'
import {Button, Checkbox, TextInput} from '@sanity/ui'
import {type FormEvent, type JSX, Suspense, useState} from 'react'
import {Box, Card, Flex, Spinner, Text, VStack} from 'ui5'

import {LoadMore} from '../components/LoadMore'
import {PageLayout} from '../components/PageLayout'

interface TodoFields {
  text?: string
  completed?: boolean
  createdAtMs?: number
}

function TodoItem({handle}: {handle: DocumentHandle<'todo'>}): JSX.Element {
  const {data} = useDocumentProjection<TodoFields>({
    ...handle,
    projection: '{text, completed, createdAtMs}',
  })
  const apply = useApplyDocumentActions()

  const updateCompleted = async (completed: boolean) => {
    const result = await apply([editDocument(handle, {set: {completed}}), publishDocument(handle)])
    await result.submitted()
  }

  const remove = async () => {
    const result = await apply(deleteDocument(handle))
    await result.submitted()
  }

  return (
    <Card as="li" borderBottom padding={3}>
      <Flex alignItems="center" gap={3}>
        <Checkbox
          aria-label={`Mark ${data.text || 'untitled todo'} as ${
            data.completed ? 'incomplete' : 'complete'
          }`}
          checked={data.completed ?? false}
          onChange={(event) => updateCompleted(event.currentTarget.checked)}
        />
        <Box flexGrow={1}>
          <Text
            muted={data.completed}
            size={1}
            style={{textDecoration: data.completed ? 'line-through' : undefined}}
          >
            {data.text || <em>Untitled</em>}
          </Text>
        </Box>
        <Button fontSize={1} mode="bleed" onClick={remove} text="Delete" tone="critical" />
      </Flex>
    </Card>
  )
}

function TodoItemFallback(): JSX.Element {
  return (
    <Card as="li" borderBottom padding={3}>
      <Flex alignItems="center" gap={2}>
        <Spinner />
        <Text muted size={1}>
          Loading todo…
        </Text>
      </Flex>
    </Card>
  )
}

export function TodoRoute(): JSX.Element {
  const [text, setText] = useState('')
  const apply = useApplyDocumentActions()
  const {count, data, hasMore, isPending, loadMore} = useDocuments({
    documentType: 'todo',
    batchSize: 100,
    orderings: [{field: '_createdAt', direction: 'asc'}],
  })

  const addTodo = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const value = text.trim()
    if (!value) return

    const handle = createDocumentHandle({
      documentId: crypto.randomUUID(),
      documentType: 'todo',
    })
    const initialValue = {
      text: value,
      completed: false,
      createdAtMs: Date.now(),
    } satisfies TodoFields

    await apply([createDocument(handle, initialValue), publishDocument(handle)])
    setText('')
  }

  return (
    <PageLayout
      title="Todo"
      subtitle="SDK-backed documents with no user-land optimistic list state"
    >
      <Card padding={4}>
        <form onSubmit={addTodo}>
          <Flex alignItems="flex-end" gap={2}>
            <Box flexGrow={1}>
              <TextInput
                label="What needs to be done?"
                onChange={(event) => setText(event.currentTarget.value)}
                placeholder="Add a todo"
                value={text}
              />
            </Box>
            <Button disabled={!text.trim()} text="Add todo" tone="primary" type="submit" />
          </Flex>
        </form>
      </Card>

      <Card>
        <VStack>
          <Box borderBottom padding={3}>
            <Text size={1} weight="semibold">
              {count} {count === 1 ? 'item' : 'items'}
            </Text>
          </Box>
          {data.length === 0 ? (
            <Box padding={4}>
              <Text align="center" muted size={1}>
                {isPending ? 'Loading todos…' : 'No todos yet'}
              </Text>
            </Box>
          ) : (
            <ul style={{listStyle: 'none'}}>
              {data.map((handle) => (
                <Suspense key={handle.documentId} fallback={<TodoItemFallback />}>
                  <TodoItem handle={handle} />
                </Suspense>
              ))}
            </ul>
          )}
          <LoadMore hasMore={hasMore} isPending={isPending} onLoadMore={loadMore} />
        </VStack>
      </Card>
    </PageLayout>
  )
}
