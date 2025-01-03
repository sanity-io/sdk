import fs from 'fs/promises'
import path from 'path'

/**
 * Checks if a directory is empty or non-existent.
 * Also checks if the directory contains an index.html file.
 *
 * @internal
 *
 * @param sourceDir - The directory to check
 */
export async function checkDir(sourceDir: string): Promise<void> {
  try {
    const stats = await fs.stat(sourceDir)
    if (!stats.isDirectory()) {
      throw new Error(`Directory ${sourceDir} is not a directory`)
    }
  } catch (err) {
    const error =
      (err as NodeJS.ErrnoException).code === 'ENOENT'
        ? new Error(`Directory "${sourceDir}" does not exist`)
        : err

    throw error
  }

  try {
    await fs.stat(path.join(sourceDir, 'index.html'))
  } catch (err) {
    const error =
      (err as NodeJS.ErrnoException).code === 'ENOENT'
        ? new Error(
            [
              `"${sourceDir}/index.html" does not exist -`,
              '[SOURCE_DIR] must be a directory containing',
              'a static app build',
            ].join(' '),
          )
        : err

    throw error
  }
}
