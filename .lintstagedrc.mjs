// @ts-check
import {resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

const oxlintConfig = resolve(fileURLToPath(new URL('.', import.meta.url)), '.oxlintrc.jsonc')

export default {
  '!(*.{js,jsx,ts,tsx,npmrc,gitignore})': 'prettier --write',
  '*.{js,jsx,ts,tsx}': [
    `oxlint --config "${oxlintConfig}" --fix --quiet`,
    'eslint --fix',
    'prettier --write',
  ],
}
