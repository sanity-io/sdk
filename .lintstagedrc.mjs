// @ts-check
export default {
  '!(*.{js,jsx,ts,tsx,npmrc,gitignore})': 'prettier --write',
  '*.{js,jsx,ts,tsx}': [
    'oxlint --config .oxlintrc.jsonc --fix --quiet',
    'eslint --fix',
    'prettier --write',
  ],
}
