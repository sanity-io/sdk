// apps/kitchensink-react/src/_intents/viewHat.ts
import {defineIntent, type IntentParameterConfig} from '@sanity/sdk-react' // Adjust import path as needed

// Define a type for your handler's payload for better type safety
interface ViewHatPayload {
  documentHandle: string
  hatStyle?: string
  // Allow other properties that might be passed through but are not explicitly typed
  [key: string]: unknown
}

export default defineIntent<ViewHatPayload>({
  action: 'view',
  name: 'View Current Hat',
  description:
    'Navigates the user to view the details of the current hat associated with a person.',
  filters: [{type: '_person'}, {projectId: 'abc123'}, {dataset: 'production'}],
  parameters: [
    {
      id: 'documentHandle',
      type: 'documentHandle', // A conceptual type, could be a string ID
      required: true,
      description: 'A handle or ID for the person document whose hat is to be viewed.',
    } as IntentParameterConfig, // Type assertion if needed, or ensure type compatibility
    {
      id: 'hatStyle',
      type: 'string',
      required: false,
      description:
        "Specify a particular style of hat if there are multiple (e.g., 'fedora', 'beanie')",
    } as IntentParameterConfig,
  ],
  async handler(payload: ViewHatPayload) {
    // eslint-disable-next-line no-console
    console.log(`[Intent Handler: viewHat] Triggered for document: ${payload.documentHandle}`)

    if (payload.hatStyle) {
      // eslint-disable-next-line no-console
      console.log(`[Intent Handler: viewHat] Specific hat style requested: ${payload.hatStyle}`)
    }

    // --- Example Implementation ---
    // In a real application, you would use your app's routing and data fetching logic.

    // 1. Fetch person data (if documentHandle is just an ID)
    // const person = await sanityClient.getDocument(payload.documentHandle);
    // const hatId = person?.hatReference?._ref;

    // 2. Or, if documentHandle itself implies the hat, use it directly.
    // const hatId = determineHatIdFromHandle(payload.documentHandle);

    // 3. Navigate to the hat viewing page/component in your application
    // if (hatId) {
    //   // Assuming you have a router instance available
    //   // router.push(`/hats/${hatId}?style=${payload.hatStyle || 'default'}`);
    //   console.log(`[Intent Handler: viewHat] Navigating to hat view for hat ID (simulated): ${hatId}`);
    // } else {
    //   console.warn(
    //     `[Intent Handler: viewHat] Could not determine hat to view for document: ${payload.documentHandle}`
    //   );
    //   // Maybe navigate to a fallback or show an error
    // }

    // For this example, we'll just log the action.
    // Replace with your actual navigation/data logic.
    alert(
      `Simulating navigation to view hat for document: ${payload.documentHandle}${payload.hatStyle ? ` (Style: ${payload.hatStyle})` : ''}`,
    )
    // --- End Example Implementation ---
  },
})
