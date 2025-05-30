## Registered App intent

```ts
import {ALLOWED_INTENTS} from '@sanity/sdk'

config: SanityConfig = {
  ...
  intents: [
    {
      action: 'view',
      name: 'View hat',
      id: 'viewHat',
      filters?: [
        type: '_person',
        projectId: 'abc123'
        dataset: 'production'
      ]
      description: 'Navigates the user to the current hat',
      parameters: [{
        id: 'documentHandle'
        type: 'documentHandle'
        required: true,
      }]
    },
    {
      action: 'edit',
      name: 'Edit favorite foods',
      id: 'editFavFoods',
      filters: [
        type: '_person',
      ]
      description: 'Navigates the user to the favorite foods editor only',
      parameters: [{
        id: 'documentHandle'
        type: 'documentHandle'
        required: true,
      }]
    },
    {
      action: 'execute',
      name: 'Go go Gadget arms!',
      id: 'goGadget',
      filters: [
        type: '_person',
      ]
      description: 'Allows the user to extend their arms',
      parameters: [
        {
          id: 'documentHandle'
          type: 'documentHandle'
          required: true,
        },
        {
          id: 'armLength'
          type: 'number'
          required: true,
          description: 'Length in inches to extend arms'
        }
      ]
    }
  ]
}
```

## Code in App for intent handling

```js
import {useIntentReceived, useRegisterIntentHandler} from '@sanity/sdk-react'

const sanityConfigs: SanityConfig[] = [
  {
    projectId: 'ppsg7ml5',
    dataset: 'test',
  },
  {
    projectId: 'd45jg133',
    dataset: 'production',
  },
]

const MyIntentsHandler() {
  const intent = useIntentReceived()
  // maybe the intent handler code should go here?
  useRegisterIntentHandler('goGadget', (intentPayload) => {
    personId = intentPayload.id
    personId.extendArms(intentPayload.length)
  }, []);

  return null // this is a renderless component
}

const MyApp(){
  <SanityApp>
    <MyIntentHandler />
    <TheRestOfTheOwl />
  </SanityApp>
}
```

----- generated from llm -----

## Defining App Intents via Files

The primary way to make your application capable of handling intents is by defining them as individual files within a special `_intents/` directory in your project source (e.g., `src/_intents/`). The Sanity SDK build process will automatically detect these files, register their handlers, and generate a manifest for discovery by the Sanity Dashboard.

Each file in the `_intents/` directory represents a single intent. The filename (without the extension) serves as the unique `id` for the intent.

**Structure of an Intent File:**

Each intent file should export several pieces of metadata and a `handler` function.

**Example: `src/_intents/viewProduct.ts`**

```typescript
// src/_intents/viewProduct.ts

// ---- Metadata ----

/** (Required) Action category of the intent (e.g., 'view', 'edit', 'execute') */
export const action: string = 'view'

/** (Required) Human-readable name for the intent. */
export const name: string = 'View Product Details'

/**
 * (Optional) Array of filter objects to determine when this intent is applicable.
 * These filters are matched against the context provided by the Dashboard.
 * For example, an intent might only be relevant for a specific document type
 * or within a particular project/dataset.
 */
export const filters: Array<Record<string, any>> = [
  {type: 'product'}, // Only applicable if the context involves a 'product' document type
  {dataset: 'production'}, // And only for the 'production' dataset
]

/** (Optional) A more detailed description of what the intent does. */
export const description: string = 'Opens the main product detail view for the specified product.'

/**
 * (Optional) Array defining the parameters this intent expects.
 * This helps with validation and can be used by the Dashboard to prepare the intent payload.
 */
export const parameters: Array<{
  id: string // Parameter name
  type: string // Data type (e.g., 'string', 'number', 'documentHandle')
  required?: boolean
  description?: string
}> = [
  {
    id: 'productId',
    type: 'string',
    required: true,
    description: 'The unique ID of the product to view.',
  },
]

// ---- Handler ----

/**
 * (Required) The function that executes the intent's logic.
 * It receives a payload containing the intent parameters.
 * The `id` in the payload corresponds to the filename.
 */
export async function handler(payload: {productId: string; [key: string]: any}) {
  console.log(`Handling 'viewProduct' intent for product ID: ${payload.productId}`)
  // Example:
  // await router.push(`/products/${payload.productId}`);
  // Or interact with other services, etc.
}
```

**Supported Metadata Fields:**

- `id`: (string, derived from filename) Unique identifier for the intent.
- `action`: (string, required) The general verb for the intent (e.g., `view`, `edit`, `execute`, `create`).
- `name`: (string, required) A short, human-readable name for the intent displayed in UIs.
- `description`: (string, optional) A longer description of the intent's purpose.
- `filters`: (Array<Record<string, any>>, optional) Conditions that must be met for the intent to be considered applicable. Used by the Dashboard to narrow down choices.
  - Each object in the array is a key-value pair. For the intent to match, all filter conditions from at least one filter object in the array must be satisfied by the context in which the intent is being considered. (This part might need more refinement based on exact filter logic).
  - Common filter keys might include `type` (e.g., document type), `projectId`, `dataset`.
- `parameters`: (Array<IntentParameter>, optional) Describes the data payload the intent's `handler` expects.
  - `IntentParameter`: `{ id: string, type: string, required?: boolean, description?: string }`

When you build your application, these intent definitions are collected.

## Intent Manifest for Dashboard Discovery

During the build process, the Sanity SDK tools will scan your `_intents/` directory and generate a JSON file (e.g., `public/intent-manifest.json` or a path accessible to the Dashboard). This manifest contains the metadata for all intents your application can handle.

**This manifest does NOT include the `handler` functions themselves**, only their definitions.

The Sanity Dashboard will use this manifest to:

- Discover which applications can handle specific intents based on `action`, `filters`, and `parameters`.
- Present users with a choice of suitable applications if multiple can handle a given intent.

**Example `intent-manifest.json` Entry:**

```json
{
  "id": "viewProduct",
  "action": "view",
  "name": "View Product Details",
  "filters": [{"type": "product"}, {"dataset": "production"}],
  "description": "Opens the main product detail view for the specified product.",
  "parameters": [
    {
      "id": "productId",
      "type": "string",
      "required": true,
      "description": "The unique ID of the product to view."
    }
  ]
}
```

## Reacting to Intents in Components

While the primary logic for an intent is defined in its `handler` function within the `_intents/` file, your React components might still need to observe or react when an intent has been dispatched and handled. For this, the SDK provides the `useIntentReceived` hook.

### `useIntentReceived()`

This hook allows a component to be notified after an intent has been processed by the SDK (meaning its corresponding handler from the `_intents/` directory, if matched, has been executed).

```javascript
import {useIntentReceived} from '@sanity/sdk-react' // Ensure correct import path

const MyActivityLogger = () => {
  const lastIntent = useIntentReceived() // Gets the most recently processed intent object

  useEffect(() => {
    if (lastIntent) {
      console.log(`Intent processed: ${lastIntent.id}`, lastIntent.payload)
      // Example: send to analytics, update some local state, show a notification
    }
  }, [lastIntent])

  return null // This can be a renderless component
}

// Usage in your app:
// <SanityApp config={sanityConfigs} fallback={<Loading/>}>
//   <MyActivityLogger />
//   <TheRestOfTheApp />
// </SanityApp>
```

The `lastIntent` object will typically contain:

- `id`: The ID of the intent (e.g., "viewProduct").
- `payload`: The parameters that were passed to the intent's handler.
- Other relevant metadata if included by the SDK.

You can also use `useIntentReceived` to listen for a _specific_ intent:

```javascript
import { useIntentReceived } from '@sanity/sdk-react';

const ProductPageEnhancer = ({ productId }) => {
  const intent = useIntentReceived('editProduct', (payload) => payload.productId === productId);

  useEffect(() => {
    if (intent) {
      // e.g., refresh product data because it might have been edited via an intent
      console.log(`Product ${productId} might have been edited via an intent.`);
    }
  }, [intent, productId]);

  return (/* ... your component UI ... */);
};
```

_(The exact API for specific intent listening might need refinement: e.g., `useIntentReceived('editProduct')` and then check payload, or a predicate function as shown)._

## Dynamic Intent Registration (Advanced)

In less common scenarios, you might need to register or unregister intent handlers dynamically from within a React component's lifecycle, rather than relying solely on the file-based system. For this, the `useRegisterIntentHandler` hook can be used.

This is generally for intents that are highly context-specific to a component's state or temporary conditions.

```javascript
import {useRegisterIntentHandler} from '@sanity/sdk-react' // Ensure correct import path
import {useEffect} from 'react'

const TemporaryTaskHandler = ({taskId, onComplete}) => {
  const handler = (payload) => {
    if (payload.taskId === taskId) {
      console.log(`Handling temporary task: ${taskId}`)
      onComplete()
      // Perform actions for this specific task
    }
  }

  // Register the handler when the component mounts (or taskId changes)
  // The hook should handle unregistration on cleanup.
  const unregister = useRegisterIntentHandler(`completeTask_${taskId}`, handler, [
    taskId,
    onComplete,
  ])

  // Optional: Explicitly unregister if needed before component unmounts,
  // though useRegisterIntentHandler should ideally return a cleanup function.
  useEffect(() => {
    return () => {
      // unregister(); // If useRegisterIntentHandler doesn't auto-cleanup
    }
  }, [unregister])

  return <div>Managing task: {taskId}</div>
}
```

**Note:** Intents registered via `useRegisterIntentHandler` will likely **not** be part of the statically generated `intent-manifest.json` unless your build process has a way to discover these dynamic registrations (which is typically complex and not standard). Their primary use is for runtime, client-side intent handling logic.

---

_Previous content of intents.md needs to be reviewed and removed or merged if it discussed the old SanityConfig-based registration as the primary method._
