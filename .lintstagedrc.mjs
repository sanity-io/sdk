// @ts-check
export default {
  '!(*.{js,jsx,ts,tsx,npmrc,gitignore})': 'prettier --write --ignore-unknown',
  '*.{js,jsx,ts,tsx}': ['eslint --fix', 'prettier --write'],
}
