import {type CliCommandDefinition} from '@sanity/cli'

const helpText = `
Options:
  -y, --yes Unattended mode, answers "yes" to any "yes/no" prompt and otherwise uses defaults

Examples:
  sanity app deploy
  sanity app deploy lib
`

/**
 * @internal
 */
export const deployCommand: CliCommandDefinition = {
  name: 'deploy',
  group: 'app',
  signature: '[OUTPUT_DIR]',
  description: 'Deploy a SDK app to Sanity',
  async action(args, context) {
    const mod = await import('../actions/deployAction')

    return mod.default(args, context)
  },
  helpText,
}
