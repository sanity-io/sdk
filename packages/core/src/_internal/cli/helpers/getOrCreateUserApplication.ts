import {type CliCommandContext, type CliOutputter} from '@sanity/cli'
import {type SanityClient} from '@sanity/client'

import {createUserApplication} from './createUserApplication'
import {debug} from './debug'
import {getUserApplication, type UserApplication} from './getUserApplication'
import {isClientError} from './isClientError'

export interface GetOrCreateUserApplicationOptions {
  client: SanityClient
  context: Pick<CliCommandContext, 'output' | 'prompt'>
  spinner: ReturnType<CliOutputter['spinner']>
  appHost?: string
}

export async function getOrCreateUserApplication({
  client,
  context,
  spinner,
  appHost,
}: GetOrCreateUserApplicationOptions): Promise<UserApplication> {
  const {output} = context
  // if there is already an existing user-app, then just return it
  const existingUserApplication = await getUserApplication({client, appHost})

  // Complete the spinner so prompt can properly work
  spinner.succeed()

  if (existingUserApplication) {
    return existingUserApplication
  }

  const newAppHost = appHost || `app-${client.config().projectId}`

  output.print('Your project has not been assigned a app hostname.')
  output.print(`Creating https://${newAppHost}.sanity.studio`)
  output.print('')
  spinner.start('Creating studio hostname')

  try {
    const response = await createUserApplication(client, {
      appHost: newAppHost,
      urlType: 'internal',
      type: 'sdkApp',
    })
    spinner.succeed()

    return response
  } catch (e) {
    spinner.fail()
    // if the name is taken, it should return a 409 so we relay to the user
    if (isClientError(e) && [402, 409].includes(e?.statusCode)) {
      throw new Error(e?.response?.body?.message || 'Bad request') // just in case
    }

    debug('Error creating user application from config', e)
    // otherwise, it's a fatal error
    throw e
  }
}
