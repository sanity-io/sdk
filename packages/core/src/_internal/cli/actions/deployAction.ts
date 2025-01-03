import path from 'node:path'
import zlib from 'node:zlib'

import {type CliCommandArguments, type CliCommandContext} from '@sanity/cli'
import tar from 'tar-fs'

// import {hideBin} from 'yargs/helpers'
// import yargs from 'yargs/yargs'
import {checkDir} from '../helpers/checkDir'
import {createDeployment} from '../helpers/createDeployment'
import {debug} from '../helpers/debug'
import {getOrCreateUserApplication} from '../helpers/getOrCreateUserApplication'
import type {UserApplication} from '../helpers/getUserApplication'

export interface DeployAppActionFlags {
  yes?: boolean
  y?: boolean
}

// function parseCliFlags(args: {argv?: string[]}) {
//   return yargs(hideBin(args.argv || process.argv).slice(2))
//     .options('yes', {
//       type: 'boolean',
//       default: false,
//     })
//     .options('y', {
//       type: 'boolean',
//       default: false,
//     }).argv
// }

const DEFAULT_OUTPUT_DIR = 'dist'

export default async function deployAppAction(
  args: CliCommandArguments<DeployAppActionFlags>,
  context: CliCommandContext,
): Promise<void> {
  const {output, workDir, apiClient, chalk, cliConfig} = context
  // const flags = await parseCliFlags(args)
  const customOutputDir = args.argsWithoutOptions[0] || DEFAULT_OUTPUT_DIR
  const outputDir = path.resolve(process.cwd(), customOutputDir || path.join(workDir, 'dist'))
  // @ts-expect-error - appHost is in new version of cli
  const configAppHost = cliConfig && 'sdk' in cliConfig && cliConfig?.sdk?.appHost

  // const hasYesFlag = flags.yes || flags.y

  let spinner = output.spinner('Verifying local content').start()

  // Check if the output directory exists and has files in it.
  try {
    await checkDir(outputDir)
    spinner.succeed()
  } catch (err) {
    spinner.fail()
    debug('Error checking directory', err)
    throw err
  }

  spinner = output.spinner('Checking app info').start()

  const client = apiClient({
    requireUser: true,
    requireProject: true,
  }).withConfig({apiVersion: 'v2025-01-01'})

  let userApplication: UserApplication

  try {
    userApplication = await getOrCreateUserApplication({
      client,
      context,
      spinner,
      appHost: configAppHost,
    })
  } catch (err) {
    if (err instanceof Error && err.message) {
      output.error(chalk.red(err.message))
      return
    }

    debug('Error creating user application', err)
    throw err
  }

  // Now create a tarball of the given directory
  const parentDir = path.dirname(outputDir)
  const base = path.basename(outputDir)
  const tarball = tar.pack(parentDir, {entries: [base]}).pipe(zlib.createGzip())

  spinner = output.spinner('Deploying to Sanity').start()

  try {
    const {location} = await createDeployment({
      client,
      applicationId: userApplication.id,
      tarball,
      // TODO: Fix
      version: '1',
    })

    spinner.succeed()
    // And let the user know we're done
    output.print(`\nSuccess! App deployed to ${chalk.cyan(location)}`)

    if (!configAppHost) {
      output.print(`\nAdd ${chalk.cyan(`studioHost: '${userApplication.appHost}'`)}`)
      output.print('to defineCliConfig root properties in sanity.cli.js or sanity.cli.ts')
      output.print('to avoid prompting for hostname on next deploy.')
    }
  } catch (err) {
    spinner.fail()
    debug('Error deploying studio', err)
    throw err
  }
}
