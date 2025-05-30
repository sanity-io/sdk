import fs from 'fs/promises'
import path from 'path'

import {type IntentConfig, type IntentParameterConfig} from './defineIntent'

/**
 * Defines the structure for an intent parameter as part of its manifest.
 */
export interface IntentParameterDefinition {
  id: string
  type: string
  required?: boolean
  description?: string
}

/**
 * Defines the structure for an intent's manifest entry.
 * This is the metadata that will be collected and made available for discovery.
 */
export interface IntentManifestEntry {
  id: string
  action: string
  name: string
  description?: string
  filters?: Array<Record<string, unknown>>
  parameters?: IntentParameterDefinition[]
}

/**
 * Scans a specified directory for intent definition files (ending in .ts, .js, .mjs, .mts),
 * extracts their metadata from the default export (expected to be an IntentConfig object),
 * and returns an array of intent manifest entries.
 *
 * This function is designed to be used in build processes (e.g., Vite/Webpack plugins, custom scripts)
 * to generate a manifest of intents an application can handle.
 *
 * @param intentsDirPath - The absolute path to the directory containing intent definition files.
 * @returns A promise that resolves to an array of {@link IntentManifestEntry} objects.
 * @throws If the `intentsDirPath` does not exist or if critical errors occur during processing.
 */
export async function extractIntentManifest(
  intentsDirPath: string,
): Promise<IntentManifestEntry[]> {
  const manifestEntries: IntentManifestEntry[] = []

  try {
    await fs.access(intentsDirPath) // Check if directory exists
  } catch (e) {
    const err = e as NodeJS.ErrnoException
    if (err.code === 'ENOENT') {
      throw new Error(
        `Intents directory not found at specified path: ${intentsDirPath}. Please ensure the directory exists and the path is correct.`,
      )
    }
    throw new Error(
      `Error accessing intents directory at ${intentsDirPath}: ${err.message || 'Unknown error'}`,
    )
  }

  const files = await fs.readdir(intentsDirPath)

  for (const file of files) {
    if (file.startsWith('.')) {
      // Skip hidden files like .DS_Store
      continue
    }
    if (
      file.endsWith('.ts') ||
      file.endsWith('.js') ||
      file.endsWith('.mjs') ||
      file.endsWith('.mts')
    ) {
      const intentId = path.parse(file).name
      const absoluteFilePath = path.join(intentsDirPath, file)
      const modulePath = 'file:///' + absoluteFilePath.replace(/\\/g, '/')

      try {
        const importedModule = (await import(modulePath)) as {default?: unknown}

        if (
          !importedModule ||
          typeof importedModule.default !== 'object' ||
          importedModule.default === null
        ) {
          // eslint-disable-next-line no-console
          console.warn(
            `[WARN] Skipping intent file '${file}' in ${intentsDirPath}: Does not have a valid default export or default export is not an object.`,
          )
          continue
        }

        const intentConfig = importedModule.default as IntentConfig<
          Record<string, unknown>,
          Record<string, unknown>
        >

        if (typeof intentConfig.action !== 'string' || !intentConfig.action.trim()) {
          // eslint-disable-next-line no-console
          console.warn(
            `[WARN] Skipping intent '${intentId}' from file '${file}': 'action' metadata is missing, empty, or not a string in the default export.`,
          )
          continue
        }
        if (typeof intentConfig.name !== 'string' || !intentConfig.name.trim()) {
          // eslint-disable-next-line no-console
          console.warn(
            `[WARN] Skipping intent '${intentId}' from file '${file}': 'name' metadata is missing, empty, or not a string in the default export.`,
          )
          continue
        }

        const entry: IntentManifestEntry = {
          id: intentId,
          action: intentConfig.action,
          name: intentConfig.name,
        }

        if (intentConfig.description && typeof intentConfig.description === 'string') {
          entry.description = intentConfig.description
        }
        if (Array.isArray(intentConfig.filters)) {
          entry.filters = intentConfig.filters
        }
        if (Array.isArray(intentConfig.parameters)) {
          entry.parameters = intentConfig.parameters.map((p: IntentParameterConfig) => ({
            id: p.id,
            type: p.type,
            required: p.required,
            description: p.description,
          }))
        }

        manifestEntries.push(entry)
      } catch (e: unknown) {
        const error = e as Error
        // eslint-disable-next-line no-console
        console.warn(
          `[WARN] Could not fully process intent file '${file}' in ${intentsDirPath}. Error: ${error.message}`,
        )
      }
    }
  }
  return manifestEntries
}
