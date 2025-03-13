export interface UserData {
  id: string
  name: string
  email: string
}

export interface ToIFrameMessage {
  type: 'TO_IFRAME'
  data: {message: string}
}

export interface FromIFrameMessage {
  type: 'FROM_IFRAME'
  data: {message: string}
}

export interface FetchUsersRequest {
  type: 'FETCH_USERS'
}
