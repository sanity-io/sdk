import {sanitySdkStore} from './sanitySdkStore'

// Example of a core vanilla js function that subscribes to the schema state
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const schemaTestSubscribe = (): void => {
  // eslint-disable-next-line no-console, @typescript-eslint/no-explicit-any
  sanitySdkStore.subscribe((state: any) => console.log('[+] Schema State updated', state.schema))
}

export {testFunction} from './example/example'
export {sanitySdkStore}
