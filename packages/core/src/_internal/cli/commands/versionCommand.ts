import {type CliCommandDefinition} from '@sanity/cli'

import {version} from '../../../../package.json'

/**
 * @internal
 */
export const versionCommand: CliCommandDefinition = {
  name: 'version',
  group: 'app',
  signature: '',
  description: 'Prints the current @sanity/sdk package version',
  async action(_, context) {
    const {output} = context

    output.print(`SDK Version: ${version}`)
  },
  helpText: 'Prints the current @sanity/sdk package version',
}
