# Logger Usage Examples

This document shows how to use the logging infrastructure in different scenarios.

## For SDK Users

### Basic Setup

```typescript
import {configureLogging, createSanityInstance} from '@sanity/sdk'

// Enable logging in development
if (process.env.NODE_ENV === 'development') {
  configureLogging({
    level: 'info',
    namespaces: ['auth', 'document', 'query'],
  })
}

const instance = createSanityInstance({
  projectId: 'my-project',
  dataset: 'production',
})
```

### Expected Output

```
[2024-12-01T22:15:29.000Z] [INFO] [sdk] Logging configured
  level: "info"
  namespaces: ["auth", "document", "query"]
[2024-12-01T22:15:30.123Z] [INFO] [auth] Checking URL for auth code
[2024-12-01T22:15:30.456Z] [INFO] [auth] [project:my-project] [dataset:production] User logged in
  userId: "user-123"
[2024-12-01T22:15:31.789Z] [INFO] [document] [project:my-project] [dataset:production] Document synced
  documentId: "draft.post-1"
```

## For SDK Maintainers

### Using Logger in Stores

```typescript
// In authStore.ts
import {createLogger, getInstanceContext} from '../utils/logger'
import {defineStore} from '../store/defineStore'

export const authStore = defineStore<AuthStoreState>({
  name: 'Auth',

  initialize(context) {
    const {instance} = context

    // Create logger with instance context
    const logger = createLogger('auth', {
      instanceContext: getInstanceContext(instance),
    })

    // Logs will automatically include [project:x] [dataset:y]
    logger.info('Auth store initialized')

    // With additional context
    logger.debug('Fetching current user', {
      method: 'cookie',
      projectId: instance.config.projectId,
    })
  },
})
```

### Using Logger in Static Utils

```typescript
// In utils/ids.ts (no instance context)
import {createLogger} from './logger'

const logger = createLogger('sdk')

export function getDraftId(id: string): string {
  logger.trace('Converting to draft ID', {inputId: id})
  return `drafts.${id}`
}
```

### Performance Timing

```typescript
import {createTimer} from '../utils/logger'

async function fetchDocument(id: string) {
  const timer = createTimer('document', 'fetchDocument')

  try {
    const doc = await client.fetch(query, {id})
    timer.end('Document fetched successfully', {documentId: id})
    return doc
  } catch (error) {
    timer.end('Document fetch failed', {documentId: id, error})
    throw error
  }
}
```

## Multi-Instance Debugging

When working with multiple instances, logs automatically show which instance they came from:

```typescript
const prodInstance = createSanityInstance({
  projectId: 'my-project',
  dataset: 'production',
})

const stagingInstance = createSanityInstance({
  projectId: 'my-project',
  dataset: 'staging',
})

// Logs will clearly show which instance:
// [INFO] [query] [project:my-project] [dataset:production] Query executed
// [INFO] [query] [project:my-project] [dataset:staging] Query executed
```

## Environment-Based Configuration

```typescript
// Configure based on environment
const logLevel = process.env.SANITY_LOG_LEVEL || 'warn'
const logNamespaces = process.env.SANITY_LOG_NAMESPACES?.split(',') || []

configureLogging({
  level: logLevel as LogLevel,
  namespaces: logNamespaces,
})
```

Then run your app with:

```bash
SANITY_LOG_LEVEL=debug SANITY_LOG_NAMESPACES=auth,document npm start
```
