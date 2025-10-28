import {
  type AgentGenerateOptions,
  type AgentPromptOptions,
  useAgentGenerate,
  useAgentPrompt,
} from '@sanity/sdk-react'
import {Box, Button, Card, Code, Label, Stack, Text} from '@sanity/ui'
import {type JSX, useMemo, useState} from 'react'

import {PageLayout} from '../components/PageLayout'

export function AgentActionsRoute(): JSX.Element {
  const generate = useAgentGenerate()
  const prompt = useAgentPrompt()
  const [text, setText] = useState('Write a short poem about typescript and cats')
  const [promptResult, setPromptResult] = useState<string>('')
  const [generateResult, setGenerateResult] = useState<string>('')
  const [isLoadingPrompt, setIsLoadingPrompt] = useState(false)
  const [isLoadingGenerate, setIsLoadingGenerate] = useState(false)
  const generateOptions = useMemo<AgentGenerateOptions>(() => {
    return {
      // Use the schema collection id (workspace name), not the type name
      schemaId: '_.schemas.default',
      targetDocument: {
        operation: 'create',
        _id: crypto.randomUUID(),
        _type: 'movie',
      },
      instruction:
        'Generate a title and overview for a movie about $topic based on a famous movie. Try to  not pick the same movie as someone else would pick.',
      instructionParams: {topic: 'Sanity SDK'},
      target: {include: ['title', 'overview']},
      noWrite: true,
    }
  }, [])

  const promptOptions = useMemo<AgentPromptOptions>(
    () => ({instruction: text, format: 'string'}),
    [text],
  )

  return (
    <PageLayout title="Agent Actions" subtitle="Prompt and generate using the movie schema">
      <Stack space={4}>
        <Card padding={4} radius={2} shadow={1} tone="inherit">
          <Stack space={3}>
            <Label size={1}>Prompt</Label>
            <Text muted size={1}>
              Sends an instruction to the LLM and returns plain text (or JSON if requested). Does
              not reference a schema or write any data.
            </Text>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={isLoadingPrompt}
              style={{
                width: '100%',
                height: 120,
                border: '1px solid #ccc',
                borderRadius: 4,
                padding: 8,
              }}
            />
            <Box>
              <Button
                text="Run prompt"
                tone="primary"
                disabled={isLoadingPrompt}
                onClick={() => {
                  setIsLoadingPrompt(true)
                  prompt(promptOptions)
                    .then((value) => setPromptResult(String(value ?? '')))
                    .catch((err) => {
                      // eslint-disable-next-line no-console
                      console.error(err)
                    })
                    .finally(() => setIsLoadingPrompt(false))
                }}
              />
            </Box>
            {promptResult && (
              <Card padding={3} radius={2} tone="transparent">
                <Text>
                  <Code style={{whiteSpace: 'pre-wrap'}}>{promptResult}</Code>
                </Text>
              </Card>
            )}
          </Stack>
        </Card>

        <Card padding={4} radius={2} shadow={1} tone="inherit">
          <Stack space={3}>
            <Label size={1}>Generaten a Sanity document (no write)</Label>
            <Text muted size={1}>
              Generates title and overview for a movie; does not persist changes.
            </Text>
            <Text muted size={1}>
              Schema‑aware content generation targeting the current project/dataset. Use schemaId of
              your document type (e.g. &quot;movie&quot;) and target to specify fields. Set noWrite
              to preview without saving.
            </Text>
            <Box>
              <Button
                text="Generate"
                tone="primary"
                disabled={isLoadingGenerate}
                onClick={() => {
                  setIsLoadingGenerate(true)
                  const sub = generate(generateOptions).subscribe({
                    next: (value) => {
                      setGenerateResult(JSON.stringify(value, null, 2))
                      setIsLoadingGenerate(false)
                      sub.unsubscribe()
                    },
                    error: (err) => {
                      // eslint-disable-next-line no-console
                      console.error(err)
                      setIsLoadingGenerate(false)
                    },
                  })
                }}
              />
            </Box>
            {generateResult && (
              <Card padding={3} radius={2} tone="transparent">
                <Text>
                  <Code style={{whiteSpace: 'pre-wrap'}}>{generateResult}</Code>
                </Text>
              </Card>
            )}
          </Stack>
        </Card>
      </Stack>
    </PageLayout>
  )
}
