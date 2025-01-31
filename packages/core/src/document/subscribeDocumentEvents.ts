import {createAction} from '../resources/createAction'
import {type DocumentEvent, documentStore} from './documentStore'

export const subscribeDocumentEvents = createAction(documentStore, ({state}) => {
  const {events} = state.get()

  return function (eventHandler: (e: DocumentEvent) => void): () => void {
    const subscription = events.subscribe(eventHandler)
    return () => subscription.unsubscribe()
  }
})
