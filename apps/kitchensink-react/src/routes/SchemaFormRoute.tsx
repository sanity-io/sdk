import {SchemaIcon} from '@sanity/icons/Schema'
import {randomUuid} from '@sanity/sdk/_internal'
import {
  createDocument,
  createDocumentHandle,
  publishDocument,
  useApplyDocumentActions,
  useSchema,
} from '@sanity/sdk-react'
import {Button, Checkbox, Select, TextArea, TextInput} from '@sanity/ui'
import {type ChangeEvent, type JSX, Suspense, useMemo, useState} from 'react'
import {ErrorBoundary} from 'react-error-boundary'
import {Box, Card, Flex, Spinner, Text, VStack} from 'ui5'

import {PageLayout} from '../components/PageLayout'

type FieldValue = string | number | boolean

interface SchemaFieldOption {
  title?: string
  value: string | number
}

interface SchemaFieldDef {
  name: string
  type: string
  title?: string
  description?: string
  options?: {list?: (string | number | SchemaFieldOption)[]}
}

interface SchemaDocumentTypeDef {
  name: string
  title?: string
  fields: SchemaFieldDef[]
}

interface FieldInputProps {
  field: SchemaFieldDef
  onChange: (value: FieldValue) => void
  value: FieldValue | undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function toFieldDef(field: unknown): SchemaFieldDef | undefined {
  if (!isRecord(field) || typeof field['name'] !== 'string' || typeof field['type'] !== 'string') {
    return undefined
  }
  return field as unknown as SchemaFieldDef
}

function toFieldDefs(rawFields: unknown): SchemaFieldDef[] {
  if (!Array.isArray(rawFields)) return []
  const fields: SchemaFieldDef[] = []
  for (const raw of rawFields) {
    const field = toFieldDef(raw)
    if (field) fields.push(field)
  }
  return fields
}

function toDocumentType(type: Record<string, unknown>): SchemaDocumentTypeDef | undefined {
  if (type['type'] !== 'document' || typeof type['name'] !== 'string') return undefined
  const title = typeof type['title'] === 'string' ? type['title'] : undefined
  return {name: type['name'], title, fields: toFieldDefs(type['fields'])}
}

function toDocumentTypes(types: Record<string, unknown>[]): SchemaDocumentTypeDef[] {
  const documents: SchemaDocumentTypeDef[] = []
  for (const type of types) {
    const docType = toDocumentType(type)
    if (docType) documents.push(docType)
  }
  return documents
}

function FieldLabel({field}: {field: SchemaFieldDef}): JSX.Element {
  return (
    <VStack gap={1}>
      <Text size={1} weight="semibold">
        {field.title ?? field.name}
      </Text>
      {field.description && (
        <Text muted size={1}>
          {field.description}
        </Text>
      )}
    </VStack>
  )
}

function toListOptions(field: SchemaFieldDef): {title: string; value: string}[] {
  const list = field.options?.list ?? []
  return list.map((item) => {
    if (typeof item === 'object') {
      return {title: item.title ?? String(item.value), value: String(item.value)}
    }
    return {title: String(item), value: String(item)}
  })
}

function asString(value: FieldValue | undefined): string {
  return typeof value === 'string' ? value : ''
}

function StringField({field, onChange, value}: FieldInputProps): JSX.Element {
  const options = toListOptions(field)
  if (options.length > 0) {
    return (
      <Select
        onChange={(event: ChangeEvent<HTMLSelectElement>) => onChange(event.currentTarget.value)}
        value={asString(value)}
      >
        <option value="">Select…</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.title}
          </option>
        ))}
      </Select>
    )
  }
  return (
    <TextInput
      onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.currentTarget.value)}
      value={asString(value)}
    />
  )
}

function TextField({onChange, value}: FieldInputProps): JSX.Element {
  return (
    <TextArea
      onChange={(event: ChangeEvent<HTMLTextAreaElement>) => onChange(event.currentTarget.value)}
      value={asString(value)}
    />
  )
}

function NumberField({onChange, value}: FieldInputProps): JSX.Element {
  return (
    <TextInput
      onChange={(event: ChangeEvent<HTMLInputElement>) => {
        const next = event.currentTarget.value
        onChange(next === '' ? '' : Number(next))
      }}
      type="number"
      value={typeof value === 'number' ? String(value) : ''}
    />
  )
}

function BooleanField({field, onChange, value}: FieldInputProps): JSX.Element {
  return (
    <Flex alignItems="center" gap={2}>
      <Checkbox
        aria-label={field.title ?? field.name}
        checked={value === true}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.currentTarget.checked)}
      />
      <Text size={1}>{value === true ? 'On' : 'Off'}</Text>
    </Flex>
  )
}

function DateField({field, onChange, value}: FieldInputProps): JSX.Element {
  return (
    <TextInput
      onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.currentTarget.value)}
      type={field.type === 'datetime' ? 'datetime-local' : 'date'}
      value={asString(value)}
    />
  )
}

function EmailField({field, onChange, value}: FieldInputProps): JSX.Element {
  return (
    <TextInput
      onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.currentTarget.value)}
      type={field.type === 'url' ? 'url' : 'email'}
      value={asString(value)}
    />
  )
}

function UnsupportedField({field}: FieldInputProps): JSX.Element {
  return (
    <Card density="compact" tone="caution">
      <Text muted size={1}>
        Field type `{field.type}` isn&apos;t supported in this demo yet.
      </Text>
    </Card>
  )
}

const FIELD_INPUTS: Record<string, (props: FieldInputProps) => JSX.Element> = {
  string: StringField,
  text: TextField,
  number: NumberField,
  boolean: BooleanField,
  datetime: DateField,
  date: DateField,
  url: EmailField,
  email: EmailField,
}

function SchemaFieldInput(props: FieldInputProps): JSX.Element {
  const Input = FIELD_INPUTS[props.field.type] ?? UnsupportedField
  return <Input {...props} />
}

function toDateSubmitValue(value: string): string {
  const time = Date.parse(value)
  return Number.isNaN(time) ? value : new Date(time).toISOString()
}

const SUBMIT_CONVERTERS: Record<string, (value: string) => string> = {
  datetime: toDateSubmitValue,
  date: toDateSubmitValue,
}

function toSubmitValue(field: SchemaFieldDef, value: FieldValue): unknown {
  if (value === '') return undefined
  const convert = SUBMIT_CONVERTERS[field.type]
  if (convert && typeof value === 'string') return convert(value)
  return value
}

function buildInitialValue(
  docType: SchemaDocumentTypeDef,
  values: Record<string, FieldValue>,
): Record<string, unknown> {
  const initialValue: Record<string, unknown> = {}
  for (const field of docType.fields) {
    if (!(field.name in values)) continue
    const submitted = toSubmitValue(field, values[field.name])
    if (submitted !== undefined) initialValue[field.name] = submitted
  }
  return initialValue
}

function DocumentTypeFields({
  docType,
  onValue,
  values,
}: {
  docType: SchemaDocumentTypeDef
  onValue: (name: string, value: FieldValue) => void
  values: Record<string, FieldValue>
}): JSX.Element {
  if (docType.fields.length === 0) {
    return (
      <Text muted size={1}>
        This document type has no fields.
      </Text>
    )
  }
  return (
    <>
      {docType.fields.map((field) => (
        <VStack gap={2} key={field.name}>
          <FieldLabel field={field} />
          <SchemaFieldInput
            field={field}
            onChange={(value) => onValue(field.name, value)}
            value={values[field.name]}
          />
        </VStack>
      ))}
    </>
  )
}

function CreateSuccess({
  documentId,
  onReset,
}: {
  documentId: string
  onReset: () => void
}): JSX.Element {
  return (
    <VStack gap={3}>
      <Card density="regular" tone="positive">
        <Text size={1}>Document created: {documentId}</Text>
      </Card>
      <Box>
        <Button fontSize={1} mode="ghost" onClick={onReset} text="Create another" tone="primary" />
      </Box>
    </VStack>
  )
}

function SubmitButton({
  isSaving,
  onSubmit,
  title,
}: {
  isSaving: boolean
  onSubmit: () => void
  title: string
}): JSX.Element {
  return (
    <Box>
      <Button
        disabled={isSaving}
        fontSize={1}
        onClick={onSubmit}
        text={isSaving ? 'Creating…' : `Create ${title}`}
        tone="primary"
      />
    </Box>
  )
}

function DocumentForm({docType}: {docType: SchemaDocumentTypeDef}): JSX.Element {
  const [values, setValues] = useState<Record<string, FieldValue>>({})
  const [createdId, setCreatedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const apply = useApplyDocumentActions()

  const handleSubmit = async () => {
    setError(null)
    setIsSaving(true)
    try {
      const handle = createDocumentHandle({documentId: randomUuid(), documentType: docType.name})
      await apply([
        createDocument(handle, buildInitialValue(docType, values)),
        publishDocument(handle),
      ])
      setCreatedId(handle.documentId)
      setValues({})
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create document')
    } finally {
      setIsSaving(false)
    }
  }

  if (createdId) {
    return <CreateSuccess documentId={createdId} onReset={() => setCreatedId(null)} />
  }

  return (
    <VStack gap={4}>
      <DocumentTypeFields
        docType={docType}
        onValue={(name, value) => setValues((prev) => ({...prev, [name]: value}))}
        values={values}
      />
      {error && (
        <Card density="compact" tone="critical">
          <Text size={1}>{error}</Text>
        </Card>
      )}
      <SubmitButton
        isSaving={isSaving}
        onSubmit={handleSubmit}
        title={docType.title ?? docType.name}
      />
    </VStack>
  )
}

function SchemaMetaLine({
  count,
  name,
  producer,
  version,
}: {
  count: number
  name: string
  producer: string
  version: string
}): JSX.Element {
  return (
    <Text muted size={1}>
      Schema `{name}` · {count} document {count === 1 ? 'type' : 'types'} · {producer} ·{' '}
      {version.slice(0, 8)}
    </Text>
  )
}

function DocumentTypePicker({
  docTypes,
  onSelect,
  selectedName,
}: {
  docTypes: SchemaDocumentTypeDef[]
  onSelect: (name: string) => void
  selectedName: string
}): JSX.Element {
  return (
    <VStack gap={2}>
      <Text as="label" htmlFor="schema-document-type" size={1} weight="semibold">
        Document type
      </Text>
      <Select
        id="schema-document-type"
        onChange={(event: ChangeEvent<HTMLSelectElement>) => onSelect(event.currentTarget.value)}
        value={selectedName}
      >
        {docTypes.map((docType) => (
          <option key={docType.name} value={docType.name}>
            {docType.title ?? docType.name}
          </option>
        ))}
      </Select>
    </VStack>
  )
}

function SchemaForm(): JSX.Element {
  const {data: schema} = useSchema()
  const docTypes = useMemo(() => toDocumentTypes(schema.types), [schema])
  const [selectedName, setSelectedName] = useState<string | undefined>(undefined)
  const selected = docTypes.find((docType) => docType.name === selectedName) ?? docTypes[0]

  if (docTypes.length === 0 || !selected) {
    return (
      <Text muted size={1}>
        This schema has no document types to build a form from.
      </Text>
    )
  }

  return (
    <VStack gap={4}>
      <SchemaMetaLine
        count={docTypes.length}
        name={schema.name}
        producer={schema._meta.producer}
        version={schema._meta.schemaVersion}
      />
      <DocumentTypePicker
        docTypes={docTypes}
        onSelect={setSelectedName}
        selectedName={selected.name}
      />
      <Card>
        <Box padding={4}>
          <DocumentForm key={selected.name} docType={selected} />
        </Box>
      </Card>
    </VStack>
  )
}

function SchemaFormError({
  error,
  resetErrorBoundary,
}: {
  error: unknown
  resetErrorBoundary: () => void
}): JSX.Element {
  const message = error instanceof Error ? error.message : 'Unknown error'
  return (
    <VStack gap={3}>
      <Card density="regular" tone="critical">
        <VStack gap={2}>
          <Text size={1} weight="semibold">
            Couldn&apos;t load the schema
          </Text>
          <Text size={1}>{message}</Text>
          <Text muted size={1}>
            This dataset needs a published schema binding first (PUT
            /schemas/dataset/&lt;projectId&gt;.&lt;dataset&gt;).
          </Text>
        </VStack>
      </Card>
      <Box>
        <Button
          fontSize={1}
          mode="ghost"
          onClick={resetErrorBoundary}
          text="Retry"
          tone="primary"
        />
      </Box>
    </VStack>
  )
}

export function SchemaFormRoute(): JSX.Element {
  return (
    <PageLayout
      icon={SchemaIcon}
      title="Schema form"
      subtitle="A Studio-like form built dynamically from useSchema"
    >
      <ErrorBoundary
        fallbackRender={({error, resetErrorBoundary}) => (
          <SchemaFormError error={error} resetErrorBoundary={resetErrorBoundary} />
        )}
      >
        <Suspense fallback={<Spinner />}>
          <SchemaForm />
        </Suspense>
      </ErrorBoundary>
    </PageLayout>
  )
}
