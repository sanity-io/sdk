export type ToIFrameMessage = {
  type: 'TO_IFRAME'
  data: {message: string}
}

export type FromIFrameMessage = {
  type: 'FROM_IFRAME'
  data: {message: string}
}
